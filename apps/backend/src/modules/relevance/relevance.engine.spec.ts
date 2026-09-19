import { SEED_NICHE, SEED_RELEVANCE_RULES } from '../niches/seed-data';
import { RelevanceEngine, RelevanceRule } from './relevance.engine';

const rules: RelevanceRule[] = SEED_RELEVANCE_RULES.map((r, i) => ({
  id: i + 1,
  name: r.name,
  ruleType: r.ruleType,
  pattern: r.pattern,
  patternB: r.patternB ?? null,
  maxDistance: r.maxDistance ?? null,
  fields: r.fields,
  weight: r.weight,
}));
const engine = new RelevanceEngine(rules, {
  ...SEED_NICHE.relevanceConfig,
  acceptThreshold: SEED_NICHE.acceptThreshold,
  reviewThreshold: SEED_NICHE.reviewThreshold,
});

const score = (title: string, extra: Partial<Parameters<RelevanceEngine['score']>[0]> = {}) =>
  engine.score({ title, url: 'https://example.in/news/story', matchedQueryWeights: [], sourceCountry: 'India', ...extra });

describe('RelevanceEngine (seed rules)', () => {
  it('accepts clear Chief Minister coverage', () => {
    expect(score('Tamil Nadu CM Vijay signs off on 200 units of free power').status).toBe('relevant');
    expect(score('Chief Minister C. Joseph Vijay reviews flood relief in Chennai').status).toBe('relevant');
    expect(score("I will be the only power centre in Tamil Nadu, says CM Vijay in his maiden speech").status).toBe('relevant');
    expect(score("Row over national song at TVK chief Vijay's swearing in escalates").status).toBe('relevant');
  });

  it('uses provider entities for GKG records', () => {
    const r = score('MV Karuppaiah sworn in as protem Speaker of Tamil Nadu Assembly', {
      entities: 'dravidar kazhagam ; c joseph vijay ; tamilaga vettri kazhagam ; Tamil Nadu, India',
    });
    expect(r.status).toBe('relevant');
  });

  it('rejects other people and things called Vijay', () => {
    expect(score('Vijay Sethupathi new movie trailer released').status).toBe('irrelevant');
    expect(score('Kargil Vijay Diwas: tributes paid to soldiers').status).toBe('irrelevant');
    expect(score('Vijay Hazare Trophy: Tamil Nadu beat Kerala', { url: 'https://x.in/sports/cricket/story' }).status).toBe('irrelevant');
    expect(score('Former Gujarat CM Vijay Rupani remembered').status).not.toBe('relevant');
  });

  it('keeps a bare mention of Vijay weak', () => {
    expect(score('Vijay attends a wedding').status).toBe('irrelevant');
  });

  it('requires the anchor unless a provider query matched', () => {
    const noAnchor = score('Tamil Nadu CM inaugurates new bus terminus in Madurai');
    expect(noAnchor.anchorFound).toBe(false);
    expect(noAnchor.status).toBe('irrelevant');
    const viaQuery = score('Tamil Nadu CM inaugurates new bus terminus in Madurai', { matchedQueryWeights: [35] });
    expect(viaQuery.status).toBe('relevant');
  });

  it('records explainable signals and clamps the score', () => {
    const r = score('CM Vijay CM Vijay Chief Minister Joseph Vijay Tamil Nadu TVK', { matchedQueryWeights: [35, 30] });
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.signals.map((s) => s.rule)).toEqual(expect.arrayContaining(['chief-minister-vijay', 'provider-query-match', 'multiple-query-match']));
  });

  it('supports proximity rules', () => {
    const e = new RelevanceEngine(
      [{ id: 1, name: 'p', ruleType: 'proximity', pattern: 'vijay', patternB: 'cabinet', maxDistance: 3, fields: ['title'], weight: 50 }],
      { ...SEED_NICHE.relevanceConfig, anchorPattern: '', countryBoosts: {}, acceptThreshold: 50, reviewThreshold: 30 },
    );
    expect(e.score({ title: 'Vijay expands his cabinet', url: 'https://a.in/x', matchedQueryWeights: [] }).score).toBe(50);
    expect(e.score({ title: 'Vijay said many things today about the new cabinet', url: 'https://a.in/x', matchedQueryWeights: [] }).score).toBe(0);
  });
});

describe('RelevanceEngine regressions from real data', () => {
  it('does not treat other chief ministers named Vijay as the Tamil Nadu CM', () => {
    expect(score('Gujarat CM Pays Tribute to Former CM Vijay Rupani').status).toBe('irrelevant');
    expect(score('SIT Calls Former Union Minister Vijay Sampla in Behbal Kalan Firing Probe').status).toBe('irrelevant');
  });
  it('still accepts CM Vijay when another Vijay is also mentioned', () => {
    expect(score('CM Vijay responds to Vijay Vasanth on Kanyakumari port project in Tamil Nadu', { matchedQueryWeights: [35] }).status).toBe('relevant');
  });
});

describe('pre-swearing-in coverage', () => {
  it('accepts party-leader phrasing', () => {
    expect(score("Vijay's TVK Falls Short of Majority in Tamil Nadu Despite Congress Support").status).toBe('relevant');
    expect(score('Tamil Nadu Election Results 2026 Live TVK Vijay PM Modi Rahul Gandhi Updates').status).toBe('relevant');
  });
  it('keeps unrelated film coverage out of the accepted set', () => {
    expect(score("What is the meaning of Karuppu? Decoding the title of Suriya and Trisha Krishnan's new film", { url: 'https://x.in/entertainment/tamil/karuppu' }).status).not.toBe('relevant');
  });
});

describe('entity matching', () => {
  it('never matches a phrase across two different entities', () => {
    const r = score('Chhattisgarh CM Vishnu Deo Sai unveils Viksit Chhattisgarh 2047 vision', {
      url: 'https://www.bignewsnetwork.com/news/279050512/chhattisgarh-cm-vishnu-deo-sai-unveils-vision',
      entities: 'seva sankalp ; Chhattisgarh Chief Minister ; vijay sharma ; narendra modi',
    });
    expect(r.signals.map((s) => s.rule)).not.toContain('chief-minister-vijay');
    expect(r.status).not.toBe('relevant');
  });
  it('still matches within a single entity', () => {
    const r = score('MV Karuppaiah sworn in as protem Speaker of Tamil Nadu Assembly', { entities: 'dravidar kazhagam ; chief minister vijay ; tamil nadu' });
    expect(r.signals.map((s) => s.rule)).toContain('chief-minister-vijay');
  });
});

describe('deputy chief ministers named Vijay', () => {
  it('does not treat them as the Tamil Nadu CM', () => {
    const r = score('Chhattisgarh CM Vishnu Deo Sai unveils vision document', { entities: 'Chief Minister Vijay Sharma ; Chhattisgarh Chief Minister Vishnu Deo Sai' });
    expect(r.status).not.toBe('relevant');
    expect(score('Deputy Chief Minister Vijay Sharma reviews Naxal operations').status).toBe('irrelevant');
  });
});
