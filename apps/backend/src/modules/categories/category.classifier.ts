import { toMatchText, urlToMatchText } from '../../common/text';

export type CategoryField = 'title' | 'description' | 'url';

export interface CategoryRuleDef {
  categoryId: number;
  ruleType: 'phrase' | 'regex';
  pattern: string;
  fields: CategoryField[];
  weight: number;
}

export interface CategoryDef {
  id: number;
  slug: string;
  minScore: number;
}

export interface CategoryAssignment {
  categoryId: number;
  slug: string;
  score: number;
}

/** Title matches count double: headlines state what the story is about. */
const FIELD_FACTOR: Record<CategoryField, number> = { title: 2, description: 1, url: 1 };

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Rule-based, multi-label classification. An article belongs to every category whose summed
 * rule score reaches the category's minimum. Articles matching nothing fall back to `general`.
 */
export class CategoryClassifier {
  private readonly rules: Array<CategoryRuleDef & { re: RegExp }>;
  private readonly byId: Map<number, CategoryDef>;
  private readonly fallback: CategoryDef | undefined;

  constructor(categories: CategoryDef[], rules: CategoryRuleDef[], fallbackSlug = 'general') {
    this.byId = new Map(categories.map((c) => [c.id, c]));
    this.fallback = categories.find((c) => c.slug === fallbackSlug);
    this.rules = rules
      .filter((r) => this.byId.has(r.categoryId))
      .map((r) => ({
        ...r,
        re:
          r.ruleType === 'regex'
            ? new RegExp(r.pattern, 'gu')
            : new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(toMatchText(r.pattern))}(?![\\p{L}\\p{N}])`, 'gu'),
      }));
  }

  classify(input: { title: string; description?: string | null; url: string }): CategoryAssignment[] {
    const texts: Record<CategoryField, string> = {
      title: toMatchText(input.title),
      description: toMatchText(input.description),
      url: urlToMatchText(input.url),
    };
    const scores = new Map<number, number>();
    for (const rule of this.rules) {
      let best = 0;
      for (const field of rule.fields) {
        rule.re.lastIndex = 0;
        if (texts[field] && rule.re.test(texts[field])) best = Math.max(best, FIELD_FACTOR[field]);
      }
      if (best > 0) scores.set(rule.categoryId, (scores.get(rule.categoryId) ?? 0) + rule.weight * best);
    }
    const out: CategoryAssignment[] = [];
    for (const [categoryId, score] of scores) {
      const cat = this.byId.get(categoryId)!;
      if (score >= cat.minScore) out.push({ categoryId, slug: cat.slug, score: Math.round(score * 100) / 100 });
    }
    if (out.length === 0 && this.fallback) {
      out.push({ categoryId: this.fallback.id, slug: this.fallback.slug, score: 0 });
    }
    return out.sort((a, b) => b.score - a.score);
  }
}
