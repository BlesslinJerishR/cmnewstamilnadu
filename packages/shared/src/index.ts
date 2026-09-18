/**
 * Public API contract shared by the backend and the mobile application.
 * These are plain types only; nothing here depends on GDELT or any provider.
 */

export interface ArticleSummary {
  id: string;
  title: string;
  description: string | null;
  url: string;
  sourceName: string;
  sourceDomain: string;
  publishedAt: string;
  categories: string[];
  imageUrl: string | null;
}

export interface RelatedCoverage {
  id: string;
  title: string;
  url: string;
  sourceName: string;
  sourceDomain: string;
  publishedAt: string;
}

export interface ArticleDetail extends ArticleSummary {
  language: string;
  sourceCountry: string | null;
  author: string | null;
  firstSeenAt: string;
  alsoReportedBy: RelatedCoverage[];
}

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

export interface SearchResponse extends Paginated<ArticleSummary> {
  total: number;
  degraded: boolean;
}

export interface Category {
  slug: string;
  name: string;
  description: string | null;
  isFeedSection: boolean;
}

export interface Source {
  domain: string;
  name: string;
  country: string | null;
  homepageUrl: string | null;
  articleCount: number;
}

export interface FeedSection {
  key: string;
  title: string;
  categorySlug: string | null;
  items: ArticleSummary[];
}

export interface FeedResponse {
  generatedAt: string;
  sections: FeedSection[];
}

export interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  role: 'user' | 'admin';
}

export interface AuthResponse {
  token: string;
  expiresAt: string;
  user: UserProfile;
}

export interface BookmarkItem {
  article: ArticleSummary;
  bookmarkedAt: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
