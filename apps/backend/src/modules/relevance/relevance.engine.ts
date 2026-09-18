import { toMatchText, urlToMatchText } from '../../common/text';

/**
 * Deterministic relevance scoring. No AI, no embeddings, no external services:
 * the score is a sum of configurable rule weights applied to normalised text fields.
 */

export type RelevanceField = 'title' | 'description' | 'url' | 'entities';
export const RELEVANCE_FIELDS: RelevanceField[] = ['title', 'description', 'url', 'entities'];

export interface RelevanceRule {
  id: number;
  name: string;
  ruleType: 'phrase' | 'regex' | 'proximity';
  pattern: string;
  patternB: string | null;
  maxDistance: number | null;
  fields: RelevanceField[];
  weight: number;
}

export interface RelevanceConfig {
  acceptThreshold: number;
  reviewThreshold: number;
  /** How much a match in each field counts relative to a title match. */
  fieldMultipliers: Record<RelevanceField, number>;
  /**
   * The article must mention this pattern in some field (or have matched a provider query,
   * which proves the full text mentions it). Prevents generic "Tamil Nadu CM" stories about
   * someone else from scoring on context words alone. Empty string disables the anchor.
   */
  anchorPattern: string;
  /** Extra score by provider source country (lower-cased). */
  countryBoosts: Record<string, number>;
  /** Bonus when more than one distinct provider query returned the article. */
  multiQueryBonus: number;
  /** Each additional occurrence adds this fraction of the rule weight... */
  frequencyBonusPerExtra: number;
  /** ...for at most this many extra occurrences. */
  frequencyBonusCap: number;
}

export const DEFAULT_RELEVANCE_CONFIG: Omit<RelevanceConfig, 'acceptThreshold' | 'reviewThreshold'> = {
  fieldMultipliers: { title: 1, description: 0.7, url: 0.6, entities: 0.8 },
  anchorPattern: '\\bvijay\\b',
  countryBoosts: { india: 3 },
  multiQueryBonus: 5,
  frequencyBonusPerExtra: 0.1,
  frequencyBonusCap: 3,
};

export interface RelevanceInput {
  title: string;
  description?: string | null;
  url: string;
  entities?: string | null;
  sourceCountry?: string | null;
  sourceTrustWeight?: number;
  /** Weights of provider queries that returned this article. */
  matchedQueryWeights: number[];
}

export interface RelevanceSignal {
  rule: string;
  fields: RelevanceField[];
  count: number;
  contribution: number;
}

export interface RelevanceResult {
  score: number;
  status: 'relevant' | 'review' | 'irrelevant';
  anchorFound: boolean;
  signals: RelevanceSignal[];
}

interface CompiledRule {
  rule: RelevanceRule;
  count: (text: string, tokens: string[]) => number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function phraseAlternatives(pattern: string): string[] {
  return pattern
    .split('|')
    .map((p) => toMatchText(p))
    .filter((p) => p.length > 0);
}

function positionsOf(tokens: string[], phrase: string[]): number[] {
  const out: number[] = [];
  outer: for (let i = 0; i + phrase.length <= tokens.length; i++) {
    for (let j = 0; j < phrase.length; j++) if (tokens[i + j] !== phrase[j]) continue outer;
    out.push(i);
  }
  return out;
}

export function compileRule(rule: RelevanceRule): CompiledRule {
  if (rule.ruleType === 'phrase') {
    const alts = phraseAlternatives(rule.pattern);
    const re = alts.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts.map(escapeRegex).join('|')})(?![\\p{L}\\p{N}])`, 'gu') : null;
    return { rule, count: (text) => (re ? (text.match(re)?.length ?? 0) : 0) };
  }
  if (rule.ruleType === 'regex') {
    const re = new RegExp(rule.pattern, 'gu');
    return {
      rule,
      count: (text) => {
        re.lastIndex = 0;
        let n = 0;
        for (let m = re.exec(text); m !== null; m = re.exec(text)) {
          n++;
          if (m[0].length === 0) re.lastIndex++;
          if (n > 100) break;
        }
        return n;
      },
    };
  }
  const a = phraseAlternatives(rule.pattern).map((p) => p.split(' '));
  const b = phraseAlternatives(rule.patternB ?? '').map((p) => p.split(' '));
  const maxDistance = rule.maxDistance ?? 5;
  return {
    rule,
    count: (_text, tokens) => {
      const aPos = a.flatMap((p) => positionsOf(tokens, p).map((start) => ({ start, end: start + p.length - 1 })));
      if (aPos.length === 0) return 0;
      const bPos = b.flatMap((p) => positionsOf(tokens, p).map((start) => ({ start, end: start + p.length - 1 })));
      let n = 0;
      for (const x of aPos) {
        const near = bPos.some((y) => {
          const gap = y.start > x.end ? y.start - x.end : x.start > y.end ? x.start - y.end : 0;
          return gap > 0 && gap <= maxDistance;
        });
        if (near) n++;
      }
      return n;
    },
  };
}

/** Throws if a rule cannot be compiled; used when admins create or edit rules. */
export function validateRule(rule: Pick<RelevanceRule, 'ruleType' | 'pattern' | 'patternB' | 'maxDistance'>): void {
  if (rule.pattern.length === 0 || rule.pattern.length > 500) throw new Error('pattern must be 1-500 characters');
  if (rule.ruleType === 'regex') new RegExp(rule.pattern, 'gu');
  if (rule.ruleType === 'proximity' && (!rule.patternB || !rule.maxDistance)) {
    throw new Error('proximity rules need pattern_b and max_distance');
  }
}

export class RelevanceEngine {
  private readonly compiled: CompiledRule[];
  private readonly anchor: RegExp | null;

  constructor(
    rules: RelevanceRule[],
    private readonly config: RelevanceConfig,
  ) {
    this.compiled = rules.map(compileRule);
    this.anchor = config.anchorPattern ? new RegExp(config.anchorPattern, 'u') : null;
  }

  score(input: RelevanceInput): RelevanceResult {
    const texts: Record<RelevanceField, string> = {
      title: toMatchText(input.title),
      description: toMatchText(input.description),
      url: urlToMatchText(input.url),
      entities: toMatchText(input.entities),
    };
    const tokens: Record<RelevanceField, string[]> = {
      title: texts.title ? texts.title.split(' ') : [],
      description: texts.description ? texts.description.split(' ') : [],
      url: texts.url ? texts.url.split(' ') : [],
      entities: texts.entities ? texts.entities.split(' ') : [],
    };

    const signals: RelevanceSignal[] = [];
    let total = 0;

    for (const { rule, count } of this.compiled) {
      const matchedFields: RelevanceField[] = [];
      let best = 0;
      let occurrences = 0;
      for (const field of rule.fields) {
        const c = count(texts[field], tokens[field]);
        if (c > 0) {
          matchedFields.push(field);
          occurrences += c;
          best = Math.max(best, this.config.fieldMultipliers[field] ?? 0);
        }
      }
      if (matchedFields.length === 0) continue;
      // A rule counts once (at its strongest field) plus a small, capped frequency bonus.
      const extra = Math.min(occurrences - 1, this.config.frequencyBonusCap);
      const contribution = rule.weight * best * (1 + extra * this.config.frequencyBonusPerExtra);
      total += contribution;
      signals.push({ rule: rule.name, fields: matchedFields, count: occurrences, contribution: round2(contribution) });
    }

    const queryWeights = [...input.matchedQueryWeights].filter((w) => Number.isFinite(w));
    if (queryWeights.length > 0) {
      const best = Math.max(...queryWeights);
      total += best;
      signals.push({ rule: 'provider-query-match', fields: [], count: queryWeights.length, contribution: round2(best) });
      if (queryWeights.length > 1) {
        total += this.config.multiQueryBonus;
        signals.push({ rule: 'multiple-query-match', fields: [], count: queryWeights.length, contribution: this.config.multiQueryBonus });
      }
    }

    const country = (input.sourceCountry ?? '').trim().toLowerCase();
    const countryBoost = this.config.countryBoosts[country] ?? 0;
    if (countryBoost) {
      total += countryBoost;
      signals.push({ rule: `source-country:${country}`, fields: [], count: 1, contribution: countryBoost });
    }
    if (input.sourceTrustWeight) {
      total += input.sourceTrustWeight;
      signals.push({ rule: 'source-trust', fields: [], count: 1, contribution: round2(input.sourceTrustWeight) });
    }

    const anchorFound =
      !this.anchor ||
      queryWeights.length > 0 ||
      RELEVANCE_FIELDS.some((f) => this.anchor!.test(texts[f]));

    const score = round2(Math.max(0, Math.min(100, total)));
    let status: RelevanceResult['status'];
    if (!anchorFound) status = 'irrelevant';
    else if (score >= this.config.acceptThreshold) status = 'relevant';
    else if (score >= this.config.reviewThreshold) status = 'review';
    else status = 'irrelevant';

    if (!anchorFound) signals.push({ rule: 'anchor-missing', fields: [], count: 0, contribution: 0 });
    return { score, status, anchorFound, signals };
  }
}
