import { Inject, Injectable } from '@nestjs/common';
import { Unzip, UnzipInflate } from 'fflate';
import { APP_CONFIG, AppConfig } from '../../config/app-config';
import { decodeHtmlEntities, toMatchText, urlToMatchText } from '../../common/text';
import { RawCandidate } from '../processing/candidate';
import { GdeltMalformedResponseError, GdeltUnavailableError } from './gdelt-doc.client';
import { gdeltFetch } from './http';

/** GKG 2.1 column positions (tab separated, 27 columns). */
const COL = {
  RECORD_ID: 0,
  DATE: 1,
  SOURCE_COMMON_NAME: 3,
  DOCUMENT_IDENTIFIER: 4,
  V1_THEMES: 7,
  V1_LOCATIONS: 9,
  V1_PERSONS: 11,
  V1_ORGANIZATIONS: 13,
  SHARING_IMAGE: 18,
  ALL_NAMES: 23,
  EXTRAS: 26,
} as const;
const GKG_COLUMNS = 27;

export const GKG_SLOT_MINUTES = 15;

export interface GkgFileResult {
  found: boolean;
  lines: number;
  candidates: RawCandidate[];
}

/** 15-minute GKG file timestamp for a slot start (UTC), e.g. 20260510120000. */
export function gkgTimestamp(slotStart: Date): string {
  return slotStart.toISOString().replace(/[-:T]/g, '').slice(0, 12) + '00';
}

export function alignToGkgSlot(d: Date): Date {
  const ms = GKG_SLOT_MINUTES * 60 * 1000;
  return new Date(Math.floor(d.getTime() / ms) * ms);
}

function extractPageTitle(extras: string): string | null {
  const m = /<PAGE_TITLE>([\s\S]*?)<\/PAGE_TITLE>/.exec(extras);
  return m ? decodeHtmlEntities(m[1]).trim() || null : null;
}

function names(field: string | undefined, part?: number): string[] {
  if (!field) return [];
  return field
    .split(';')
    .map((entry) => (part === undefined ? entry.split(',')[0] : entry.split('#')[part]) ?? '')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Parses one GKG line into a candidate, or null when it is not a usable article for the niche.
 * `anchor` must match the title, URL or extracted person names (not merely somewhere in the
 * record, e.g. a quotation or related-links block).
 */
export function parseGkgLine(line: string, anchor: RegExp): RawCandidate | null {
  const f = line.split('\t');
  if (f.length < GKG_COLUMNS) return null;
  const url = f[COL.DOCUMENT_IDENTIFIER];
  if (!/^https?:\/\//i.test(url)) return null;
  const title = extractPageTitle(f[COL.EXTRAS] ?? '');
  if (!title) return null;
  const persons = names(f[COL.V1_PERSONS]);
  const orgs = names(f[COL.V1_ORGANIZATIONS]);
  const locations = names(f[COL.V1_LOCATIONS], 1);
  const allNames = names(f[COL.ALL_NAMES]);
  const anchorText = `${toMatchText(title)} ${urlToMatchText(url)} ${toMatchText(persons.join(' ; '))}`;
  if (!anchor.test(anchorText)) return null;
  const entities = [...new Set([...persons, ...orgs, ...locations, ...allNames])].join(' ; ');
  return {
    provider: 'gdelt-gkg',
    providerRef: f[COL.RECORD_ID] || null,
    url,
    title,
    description: null,
    imageUrl: f[COL.SHARING_IMAGE] || null,
    sourceDomain: f[COL.SOURCE_COMMON_NAME] || null,
    sourceCountry: null,
    language: 'English',
    publishedAt: f[COL.DATE],
    entities,
    matchedQueryId: null,
    metadata: { gkgRecordId: f[COL.RECORD_ID], themes: (f[COL.V1_THEMES] ?? '').split(';').filter(Boolean).slice(0, 15) },
  };
}

/**
 * Reads GDELT GKG 2.1 archive files (one zip per 15 minutes, English-language sources).
 * Used for backfilling periods older than the DOC API's search window. The zip is streamed and
 * decompressed incrementally; only lines matching the niche anchor are kept in memory.
 */
@Injectable()
export class GdeltGkgClient {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  fileUrl(slotStart: Date): string {
    return `${this.config.GDELT_GKG_BASE_URL}/${gkgTimestamp(slotStart)}.gkg.csv.zip`;
  }

  async fetchSlot(slotStart: Date, anchorPattern: string): Promise<GkgFileResult> {
    const lineFilter = new RegExp(anchorPattern, 'i');
    const anchor = new RegExp(anchorPattern, 'u');
    let res: Awaited<ReturnType<typeof gdeltFetch>>;
    try {
      res = await gdeltFetch(this.fileUrl(slotStart), {
        headers: { 'User-Agent': this.config.GDELT_USER_AGENT },
        signal: AbortSignal.timeout(Math.max(this.config.GDELT_REQUEST_TIMEOUT_MS, 120_000)),
      });
    } catch (err) {
      const cause = (err as { cause?: { code?: string; message?: string } }).cause;
      throw new GdeltUnavailableError(`GKG download failed: ${(err as Error).message}${cause ? ` (${cause.code ?? cause.message})` : ''}`);
    }
    if (res.status === 404 || res.status === 403) {
      await res.body?.cancel().catch(() => undefined);
      return { found: false, lines: 0, candidates: [] };
    }
    if (!res.ok || !res.body) throw new GdeltUnavailableError(`GKG download returned HTTP ${res.status}`);

    const candidates: RawCandidate[] = [];
    let lines = 0;
    let pending = '';
    let failure: Error | null = null;
    const decoder = new TextDecoder('utf-8');
    const handleLine = (line: string) => {
      if (!line) return;
      lines++;
      if (!lineFilter.test(line)) return;
      const c = parseGkgLine(line, anchor);
      if (c) candidates.push(c);
    };

    const unzip = new Unzip((file) => {
      if (!file.name.endsWith('.csv')) return;
      file.ondata = (err, chunk, final) => {
        if (err) {
          failure = err;
          return;
        }
        pending += decoder.decode(chunk, { stream: !final });
        const parts = pending.split('\n');
        pending = parts.pop() ?? '';
        for (const part of parts) handleLine(part.replace(/\r$/, ''));
        if (final && pending) {
          handleLine(pending.replace(/\r$/, ''));
          pending = '';
        }
      };
      file.start();
    });
    unzip.register(UnzipInflate);

    try {
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        unzip.push(chunk);
        if (failure) break;
      }
      if (!failure) unzip.push(new Uint8Array(0), true);
    } catch (err) {
      throw new GdeltUnavailableError(`GKG stream failed: ${(err as Error).message}`);
    }
    if (failure) throw new GdeltMalformedResponseError(`GKG zip could not be decompressed: ${(failure as Error).message}`);
    return { found: true, lines, candidates };
  }
}
