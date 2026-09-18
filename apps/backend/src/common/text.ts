import { createHash } from 'node:crypto';

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
};

/** Decodes the HTML entities that appear in provider titles (e.g. `&#x2013;`, `&amp;`). */
export function decodeHtmlEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      if (!Number.isFinite(n) || n <= 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return match;
      return String.fromCodePoint(n);
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });
}

// C0/C1 control characters, zero-width characters and BOM.
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]/g;

/**
 * Produces a display title. GDELT's DOC API tokenises titles (`Vijay ' s`, `U . K .`),
 * so spacing around punctuation is repaired deterministically.
 */
export function cleanDisplayText(input: string): string {
  let s = decodeHtmlEntities(input).normalize('NFKC').replace(CONTROL_CHARS, ' ');
  s = s.replace(/<[^>]*>/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/\s+([.,;:!?%)\]}])/g, '$1');
  s = s.replace(/([(\[{])\s+/g, '$1');
  s = s.replace(/(\w)\s*(['’])\s*(s|t|re|ve|ll|d|m)\b/gi, '$1$2$3');
  s = s.replace(/\b([A-Z])\.\s(?=[A-Z]\.)/g, '$1.');
  s = s.replace(/\s*([–—])\s*/g, ' $1 ');
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Matching form of text: lower case, accents folded, every non letter/digit run collapsed
 * to one space. Relevance and category rules run against this form, so "C. Joseph Vijay",
 * "c-joseph-vijay" and "C Joseph Vijay" are identical.
 */
export function toMatchText(input: string | null | undefined): string {
  if (!input) return '';
  return decodeHtmlEntities(input)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]s\b/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Words of a URL path/query that are useful as a weak relevance signal (article slugs). */
export function urlToMatchText(url: string): string {
  try {
    const u = new URL(url);
    return toMatchText(`${decodeURIComponent(u.pathname)} ${u.search}`);
  } catch {
    return '';
  }
}

export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  const cut = value.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
