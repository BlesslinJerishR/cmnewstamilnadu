import { cleanDisplayText, sha256, toMatchText, truncate } from '../../common/text';
import { canonicalizeUrl, cleanOriginalUrl, InvalidUrlError, parsePublicHttpUrl } from '../../common/url';
import { NormalizedArticle, RawCandidate } from './candidate';

export type NormalizeResult = { ok: true; article: NormalizedArticle } | { ok: false; reason: string };

const LANGUAGE_ALIASES: Record<string, string> = { english: 'en', eng: 'en', en: 'en', tamil: 'ta', tam: 'ta', ta: 'ta' };

export function normalizeLanguage(value: string | null | undefined): string {
  if (!value) return 'und';
  const key = value.trim().toLowerCase();
  return LANGUAGE_ALIASES[key] ?? (key.length <= 3 ? key : 'und');
}

/**
 * Removes a trailing " - Publisher" / " | Publisher | Slogan" decoration when it names the
 * source, so the same story from the same publisher hashes identically.
 */
export function stripSourceSuffix(title: string, domain: string): string {
  const labels = domain.split('.').slice(0, -1).filter((l) => l.length >= 4 && !['www', 'news', 'amp'].includes(l));
  const stem = domain.split('.').slice(0, -1).join('').replace(/[^a-z0-9]/g, '');
  const looksLikeSource = (segment: string) => {
    const s = segment.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (s.length < 4 || s.length > 40) return false;
    return (
      stem.includes(s) ||
      s.includes(stem) ||
      labels.some((l) => s.includes(l.replace(/[^a-z0-9]/g, ''))) ||
      /^(news|latestnews|indianews|breakingnews|topnews)$/.test(s)
    );
  };
  const sep = /\s+[|\-–—:]\s+/g;
  const cuts: number[] = [];
  for (let m = sep.exec(title); m !== null; m = sep.exec(title)) cuts.push(m.index);
  // Only the last two segments can be decoration ("Headline - Publisher | Slogan").
  for (const cut of cuts.slice(-2)) {
    const rest = title.slice(cut).replace(/^\s+[|\-–—:]\s+/, '');
    const firstSegment = rest.split(/\s+[|\-–—:]\s+/)[0];
    if (looksLikeSource(firstSegment)) {
      const head = title.slice(0, cut).trim();
      return head.length >= 10 ? head : title;
    }
  }
  return title;
}

export function parseTimestamp(value: string): Date | null {
  // GDELT forms: 20260912T120000Z (DOC) and 20260510120000 (GKG); also plain ISO.
  const compact = /^(\d{4})(\d{2})(\d{2})T?(\d{2})(\d{2})(\d{2})Z?$/.exec(value.trim());
  const d = compact
    ? new Date(Date.UTC(+compact[1], +compact[2] - 1, +compact[3], +compact[4], +compact[5], +compact[6]))
    : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function normalizeCandidate(c: RawCandidate): NormalizeResult {
  if (!c || typeof c.url !== 'string' || typeof c.title !== 'string') return { ok: false, reason: 'missing_fields' };
  let originalUrl: string;
  let canonical: { canonical: string; host: string };
  try {
    originalUrl = cleanOriginalUrl(c.url);
    canonical = canonicalizeUrl(c.url);
  } catch (err) {
    return { ok: false, reason: err instanceof InvalidUrlError ? `invalid_url:${err.message}` : 'invalid_url' };
  }

  const publishedAt = parseTimestamp(String(c.publishedAt ?? ''));
  if (!publishedAt) return { ok: false, reason: 'invalid_timestamp' };

  const sourceDomain = canonical.host;
  const title = truncate(stripSourceSuffix(cleanDisplayText(c.title), sourceDomain), 300);
  if (!title) return { ok: false, reason: 'missing_title' };
  const normalizedTitle = toMatchText(title);

  const description = c.description ? truncate(cleanDisplayText(c.description), 500) || null : null;

  let imageUrl: string | null = null;
  if (c.imageUrl) {
    try {
      const img = parsePublicHttpUrl(c.imageUrl);
      if (img.protocol === 'https:' || img.protocol === 'http:') imageUrl = img.toString();
    } catch {
      imageUrl = null;
    }
  }

  return {
    ok: true,
    article: {
      provider: c.provider,
      providerRef: c.providerRef ?? null,
      originalUrl,
      canonicalUrl: canonical.canonical,
      urlHash: sha256(canonical.canonical),
      title,
      normalizedTitle,
      titleHash: sha256(normalizedTitle),
      description,
      imageUrl,
      author: c.author ? truncate(cleanDisplayText(c.author), 120) : null,
      language: normalizeLanguage(c.language),
      sourceDomain,
      sourceCountry: c.sourceCountry ? truncate(cleanDisplayText(c.sourceCountry), 60) : null,
      publishedAt,
      entities: c.entities ? truncate(c.entities, 4000) : null,
      matchedQueryIds: typeof c.matchedQueryId === 'number' ? [c.matchedQueryId] : [],
      providerMetadata: c.metadata ?? null,
    },
  };
}
