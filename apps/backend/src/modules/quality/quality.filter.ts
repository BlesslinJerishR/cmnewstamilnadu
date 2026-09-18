import { NormalizedArticle } from '../processing/candidate';

export type QualityStatus = 'accepted' | 'pending_review' | 'rejected';

export interface QualityResult {
  status: QualityStatus;
  reasons: string[];
}

export interface QualityContext {
  now: Date;
  sourceStatus: 'active' | 'trusted' | 'blocked';
  /** Languages the public app shows. English only in the MVP. */
  allowedLanguages: string[];
}

const SUSPICIOUS_TLDS = new Set([
  'xyz', 'top', 'click', 'loan', 'work', 'gq', 'cf', 'tk', 'ml', 'ga', 'buzz', 'rest', 'fit', 'monster', 'cam', 'icu',
  'bid', 'win', 'stream', 'download', 'racing', 'review', 'party', 'trade', 'date', 'faith', 'cricket', 'accountant',
]);

const SPAM_TITLE = /\b(casino|betting tips|satta|matka|porn|xxx|escort|viagra|crypto giveaway|click here|free followers|lottery result|hack apk|mod apk)\b/i;
const NON_ARTICLE_PATH = /\/(tag|tags|topic|topics|author|authors|search|category|categories|live-updates?|photos?|gallery|galleries|videos?|web-stor(y|ies)|visual-stor(y|ies))(\/|$)/i;
const EARLIEST_ACCEPTED = Date.UTC(2000, 0, 1);

/**
 * Deterministic quality checks applied after relevance. Hard failures reject; soft signals
 * send the article to manual review. Nothing here fetches the article URL.
 */
export function assessQuality(article: NormalizedArticle, ctx: QualityContext): QualityResult {
  const hard: string[] = [];
  const soft: string[] = [];

  if (ctx.sourceStatus === 'blocked') hard.push('source_blocked');

  if (!ctx.allowedLanguages.includes(article.language)) hard.push(`language_${article.language}`);

  const published = article.publishedAt.getTime();
  if (published < EARLIEST_ACCEPTED) hard.push('timestamp_too_old');
  if (published > ctx.now.getTime() + 60 * 60 * 1000) hard.push('timestamp_in_future');

  const title = article.title;
  const words = article.normalizedTitle.split(' ').filter(Boolean);
  if (title.length < 15 || words.length < 3) hard.push('title_too_short');
  if (title.length > 290) soft.push('title_very_long');
  if (SPAM_TITLE.test(title)) hard.push('spam_title');

  const letters = title.replace(/[^\p{L}]/gu, '');
  const latin = letters.replace(/[^A-Za-zÀ-ɏ]/g, '');
  if (letters.length > 0 && latin.length / letters.length < 0.6) hard.push('title_not_english_script');
  if (letters.length >= 20 && letters === letters.toUpperCase() && /[A-Z]/.test(letters)) soft.push('title_all_caps');
  if (/[!?]{3,}/.test(title)) soft.push('excessive_punctuation');

  const tld = article.sourceDomain.split('.').pop() ?? '';
  if (SUSPICIOUS_TLDS.has(tld)) soft.push(`suspicious_tld_${tld}`);

  try {
    const path = new URL(article.originalUrl).pathname;
    if (path === '/' || path === '') hard.push('homepage_url');
    else if (NON_ARTICLE_PATH.test(path)) soft.push('non_article_url');
  } catch {
    hard.push('invalid_url');
  }

  if (hard.length > 0) return { status: 'rejected', reasons: [...hard, ...soft] };
  if (soft.length > 0 && ctx.sourceStatus !== 'trusted') return { status: 'pending_review', reasons: soft };
  return { status: 'accepted', reasons: soft };
}
