import { canonicalizeUrl } from '../../common/url';
import { cleanDisplayText, toMatchText } from '../../common/text';
import { normalizeCandidate, parseTimestamp, stripSourceSuffix } from './normalizer';

describe('URL canonicalisation', () => {
  it('collapses scheme, www, tracking params, fragments, AMP and trailing slashes', () => {
    const variants = [
      'https://www.thehindu.com/news/national/tamil-nadu/cm-vijay/article1.ece',
      'http://thehindu.com/news/national/tamil-nadu/cm-vijay/article1.ece/',
      'https://www.thehindu.com/news/national/tamil-nadu/cm-vijay/article1.ece?utm_source=x&utm_medium=y#comments',
      'https://www.thehindu.com/news/national/tamil-nadu/cm-vijay/article1.ece/amp/',
      'https://m.thehindu.com/news/national/tamil-nadu/cm-vijay/article1.ece?fbclid=abc',
    ];
    const canon = new Set(variants.map((v) => canonicalizeUrl(v).canonical));
    expect(canon.size).toBe(1);
    expect([...canon][0]).toBe('thehindu.com/news/national/tamil-nadu/cm-vijay/article1.ece');
  });

  it('keeps identifying query parameters and sorts them', () => {
    expect(canonicalizeUrl('https://example.org/story.php?b=2&id=77&utm_campaign=z').canonical).toBe('example.org/story.php?b=2&id=77');
  });

  it('rejects non-public URLs', () => {
    for (const bad of ['ftp://x.com/a', 'http://localhost/a', 'http://10.0.0.1/a', 'http://user:pw@x.com/a', 'http://x.com:8080/a', 'javascript:alert(1)']) {
      expect(() => canonicalizeUrl(bad)).toThrow();
    }
  });
});

describe('text cleanup', () => {
  it('repairs GDELT tokenised punctuation', () => {
    expect(cleanDisplayText('Tamil Nadu CM Vijay to flag off Silverstone motor race in U . K . as actor Ajith competes')).toBe(
      'Tamil Nadu CM Vijay to flag off Silverstone motor race in U.K. as actor Ajith competes',
    );
    expect(cleanDisplayText("Vijay ' s maiden speech")).toBe("Vijay's maiden speech");
    expect(cleanDisplayText('Vijay&#x2013;Trisha &amp; more')).toBe('Vijay – Trisha & more');
  });

  it('builds matching text', () => {
    expect(toMatchText('C. Joseph Vijay, Tamil Nadu’s CM')).toBe('c joseph vijay tamil nadu cm');
  });

  it('strips publisher suffixes', () => {
    expect(stripSourceSuffix('Row over national song escalates | India News', 'timesofindia.indiatimes.com')).toBe('Row over national song escalates');
    expect(stripSourceSuffix('CM Vijay speaks - The Hindu', 'thehindu.com')).toBe('CM Vijay speaks');
    expect(stripSourceSuffix('Chennai - Coimbatore highway work begins', 'dtnext.in')).toBe('Chennai - Coimbatore highway work begins');
    expect(stripSourceSuffix("Who's who in Vijay Cabinet - News Today | First with the news", 'newstodaynet.com')).toBe("Who's who in Vijay Cabinet");
    expect(stripSourceSuffix('9 TVK ministers to be sworn in along with Vijay | Rediff-TV', 'tv.rediff.com')).toBe('9 TVK ministers to be sworn in along with Vijay');
    expect(stripSourceSuffix('TN CM: A new era', 'thehindu.com')).toBe('TN CM: A new era');
  });
});

describe('normalizeCandidate', () => {
  it('parses both GDELT timestamp formats', () => {
    expect(parseTimestamp('20260912T120000Z')?.toISOString()).toBe('2026-09-12T12:00:00.000Z');
    expect(parseTimestamp('20260510120000')?.toISOString()).toBe('2026-05-10T12:00:00.000Z');
    expect(parseTimestamp('garbage')).toBeNull();
  });

  it('produces a canonical article', () => {
    const r = normalizeCandidate({
      provider: 'gdelt-doc',
      url: 'https://www.thehindu.com/news/a/article1.ece?utm_source=gdelt',
      title: 'Tamil Nadu CM Vijay ' + "' s maiden speech",
      publishedAt: '20260512T101500Z',
      language: 'English',
      sourceCountry: 'India',
      matchedQueryId: 3,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.article.originalUrl).toBe('https://www.thehindu.com/news/a/article1.ece');
    expect(r.article.sourceDomain).toBe('thehindu.com');
    expect(r.article.language).toBe('en');
    expect(r.article.title).toBe("Tamil Nadu CM Vijay's maiden speech");
    expect(r.article.matchedQueryIds).toEqual([3]);
    expect(r.article.urlHash).toHaveLength(64);
  });

  it('rejects malformed candidates', () => {
    expect(normalizeCandidate({ provider: 'x', url: 'nope', title: 'A title here', publishedAt: '20260512T101500Z' }).ok).toBe(false);
    expect(normalizeCandidate({ provider: 'x', url: 'https://a.com/x', title: 'A title here', publishedAt: 'bad' }).ok).toBe(false);
  });
});
