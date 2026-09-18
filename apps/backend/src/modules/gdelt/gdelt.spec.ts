import { parseGkgLine, gkgTimestamp, alignToGkgSlot } from './gdelt-gkg.client';
import { formatGdeltDate, GdeltDocClient, GdeltQueryRejectedError } from './gdelt-doc.client';

function gkgLine(overrides: Record<number, string>): string {
  const f = new Array(27).fill('');
  f[0] = '20260510120000-60';
  f[1] = '20260510120000';
  f[3] = 'thehindu.com';
  f[4] = 'https://www.thehindu.com/news/national/tamil-nadu/tn-chief-minister-vijay-maiden-speech/article70962016.ece';
  f[9] = '5#Tamil Nadu, Tamil Nadu, India#IN#IN25#11#78#-2112557';
  f[11] = 'jawaharlal nehru;c joseph vijay';
  f[18] = 'https://th-i.thgim.com/x.jpg';
  f[26] = '<PAGE_LINKS>https://a</PAGE_LINKS><PAGE_TITLE>Tamil Nadu CM Vijay&#x27;s maiden speech</PAGE_TITLE>';
  for (const [k, v] of Object.entries(overrides)) f[Number(k)] = v;
  return f.join('\t');
}

describe('GKG parsing', () => {
  const anchor = /\bvijay\b/u;
  it('extracts a candidate', () => {
    const c = parseGkgLine(gkgLine({}), anchor)!;
    expect(c.title).toBe("Tamil Nadu CM Vijay's maiden speech");
    expect(c.publishedAt).toBe('20260510120000');
    expect(c.entities).toContain('c joseph vijay');
    expect(c.entities).toContain('Tamil Nadu, Tamil Nadu, India');
    expect(c.provider).toBe('gdelt-gkg');
  });
  it('skips records without a title or anchor', () => {
    expect(parseGkgLine(gkgLine({ 26: '<PAGE_LINKS>x</PAGE_LINKS>' }), anchor)).toBeNull();
    expect(
      parseGkgLine(gkgLine({ 4: 'https://aninews.in/news/pm-modi-inaugurates-projects/', 11: 'narendra modi', 26: '<PAGE_TITLE>PM Modi inaugurates projects</PAGE_TITLE>' }), anchor),
    ).toBeNull();
    expect(parseGkgLine('too\tfew\tcolumns', anchor)).toBeNull();
  });
  it('formats slot timestamps', () => {
    expect(gkgTimestamp(alignToGkgSlot(new Date('2026-05-10T12:07:31Z')))).toBe('20260510120000');
    expect(formatGdeltDate(new Date('2026-05-04T00:00:00Z'))).toBe('20260504000000');
  });
});

describe('DOC API response parsing', () => {
  const client = new GdeltDocClient({ GDELT_DOC_API_URL: 'https://api.gdeltproject.org/api/v2/doc/doc' } as never, {} as never);
  it('parses articles and skips invalid items', () => {
    const body = JSON.stringify({
      articles: [
        { url: 'https://www.thehindu.com/a', title: 'CM Vijay', seendate: '20260912T120000Z', domain: 'thehindu.com', language: 'English', sourcecountry: 'India', socialimage: '' },
        { title: 'missing url', seendate: '20260912T120000Z' },
      ],
    });
    const r = client.parse(body, 7);
    expect(r.items).toHaveLength(1);
    expect(r.skipped).toBe(1);
    expect(r.items[0].matchedQueryId).toBe(7);
    expect(r.items[0].imageUrl).toBeNull();
  });
  it('treats empty responses as no results and text as a rejected query', () => {
    expect(client.parse('', 1).items).toEqual([]);
    expect(client.parse('{}', 1).items).toEqual([]);
    expect(() => client.parse('Your search contained a phrase that is too short.', 1)).toThrow(GdeltQueryRejectedError);
  });
  it('builds the query URL with language filter and window', () => {
    const url = client.buildUrl({ queryId: 1, queryText: '"Joseph Vijay"', sourceLanguage: 'english', maxResults: 250 }, new Date('2026-09-18T00:00:00Z'), new Date('2026-09-18T03:00:00Z'), 250);
    const u = new URL(url);
    expect(u.searchParams.get('query')).toBe('"Joseph Vijay" sourcelang:english');
    expect(u.searchParams.get('startdatetime')).toBe('20260918000000');
    expect(u.searchParams.get('enddatetime')).toBe('20260918030000');
    expect(u.searchParams.get('mode')).toBe('artlist');
  });
});
