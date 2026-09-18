import { SEED_CATEGORIES } from '../niches/seed-data';
import { CategoryClassifier } from './category.classifier';

const categories = SEED_CATEGORIES.map((c, i) => ({ id: i + 1, slug: c.slug, minScore: c.minScore }));
const rules = SEED_CATEGORIES.flatMap((c, i) =>
  c.keywords.map((k) => ({ categoryId: i + 1, ruleType: 'phrase' as const, pattern: k, fields: ['title', 'description', 'url'] as Array<'title' | 'description' | 'url'>, weight: 1 })),
);
const classifier = new CategoryClassifier(categories, rules);
const slugs = (title: string) => classifier.classify({ title, url: 'https://a.in/news/x' }).map((c) => c.slug);

describe('CategoryClassifier', () => {
  it('assigns multiple categories', () => {
    const s = slugs('TN CM Vijay signs off on 200 units of free power, launches welfare scheme for farmers');
    expect(s).toEqual(expect.arrayContaining(['welfare', 'events']));
  });
  it('classifies education and healthcare', () => {
    expect(slugs('Vijay government to open 500 new schools and colleges')).toContain('education');
    expect(slugs('CM Vijay inaugurates new government hospital in Madurai')).toEqual(expect.arrayContaining(['healthcare', 'tamil-nadu', 'government']));
  });
  it('falls back to general', () => {
    expect(slugs('Something unrelated happened')).toEqual(['general']);
  });
});
