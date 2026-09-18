import { isIP } from 'node:net';

/** Query parameters that only track campaigns/sessions and never identify an article. */
const TRACKING_PARAMS = new Set([
  'fbclid', 'gclid', 'dclid', 'gbraid', 'wbraid', 'msclkid', 'yclid', 'twclid', 'igshid', 'mc_cid', 'mc_eid',
  'ref', 'ref_src', 'ref_url', 'referrer', 'cmpid', 'cmp', 'icid', 'ito', 'itm_source', 'itm_medium',
  'itm_campaign', 'ncid', 'ocid', 'sr_share', 'share', 'shared', 'from', 'source', 'via', 'amp',
  'outputtype', 'originurl', '_ga', '_gl', 'hl', 'spm', 'ftag', 'pfrom', 'utm',
]);

const TRACKING_PREFIXES = ['utm_', 'at_', 'pk_', 'mtm_', 'hsa_', 'oly_', 'vero_', '__'];

const MOBILE_HOST_PREFIXES = ['www.', 'm.', 'amp.', 'mobile.'];

export interface CanonicalUrl {
  /** Fully canonical form used for hashing/uniqueness (scheme-less, lower-cased host). */
  canonical: string;
  /** Registrable-ish host without www/m/amp prefixes. */
  host: string;
}

export class InvalidUrlError extends Error {}

/**
 * Parses an external article URL and rejects anything that is not a public http(s) URL.
 * This does not fetch anything; it only validates the string.
 */
export function parsePublicHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new InvalidUrlError('unparseable URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new InvalidUrlError('unsupported scheme');
  if (url.username || url.password) throw new InvalidUrlError('credentials in URL');
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host || !host.includes('.')) throw new InvalidUrlError('host is not a public domain');
  if (isIP(host.replace(/^\[|\]$/g, ''))) throw new InvalidUrlError('IP address host');
  if (/(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain|invalid|test|example)$/.test(host)) {
    throw new InvalidUrlError('non-public host');
  }
  if (url.port && url.port !== '80' && url.port !== '443') throw new InvalidUrlError('non-standard port');
  if (raw.length > 2048) throw new InvalidUrlError('URL too long');
  return url;
}

export function stripHostPrefixes(host: string): string {
  let h = host.toLowerCase().replace(/\.$/, '');
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of MOBILE_HOST_PREFIXES) {
      if (h.startsWith(p) && h.split('.').length > 2) {
        h = h.slice(p.length);
        changed = true;
      }
    }
  }
  return h;
}

function isTrackingParam(name: string): boolean {
  const n = name.toLowerCase();
  return TRACKING_PARAMS.has(n) || TRACKING_PREFIXES.some((p) => n.startsWith(p));
}

/**
 * Canonical URL used as the primary deduplication identity:
 * - scheme dropped (http and https are the same article)
 * - host lower-cased and `www.` / `m.` / `amp.` prefixes removed
 * - fragment removed, tracking parameters removed, remaining parameters sorted
 * - AMP path variants (`/amp`, `/amp/`, `.amp`, `/amp/` segment) collapsed
 * - trailing slash and `index.html` removed
 */
export function canonicalizeUrl(raw: string): CanonicalUrl {
  const url = parsePublicHttpUrl(raw);
  const host = stripHostPrefixes(url.hostname);

  let path = url.pathname.replace(/\/{2,}/g, '/');
  try {
    path = encodeURI(decodeURI(path));
  } catch {
    // keep the path as provided if it contains invalid escapes
  }
  path = path
    .replace(/\/amp\/?$/i, '/')
    .replace(/\/amp\//i, '/')
    .replace(/\.amp(\.html?)?$/i, '$1')
    .replace(/\/index\.(html?|php)$/i, '/')
    .replace(/\/+$/, '');

  const params = [...url.searchParams.entries()]
    .filter(([k]) => !isTrackingParam(k))
    .sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)));
  const query = params.length ? `?${new URLSearchParams(params).toString()}` : '';

  return { canonical: `${host}${path || ''}${query}`, host };
}

/** Removes only tracking parameters and fragments; keeps the URL the publisher gave us clickable. */
export function cleanOriginalUrl(raw: string): string {
  const url = parsePublicHttpUrl(raw);
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (isTrackingParam(key)) url.searchParams.delete(key);
  }
  return url.toString();
}
