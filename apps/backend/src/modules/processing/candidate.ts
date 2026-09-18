/**
 * Provider-agnostic input to the article pipeline. Every provider (today only GDELT DOC and
 * GDELT GKG archive files) maps its records to this shape; nothing downstream knows about GDELT.
 */
export interface RawCandidate {
  provider: string;
  providerRef?: string | null;
  url: string;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  sourceDomain?: string | null;
  sourceCountry?: string | null;
  language?: string | null;
  author?: string | null;
  /** ISO-8601 timestamp. */
  publishedAt: string;
  /** Names of people/organisations/places the provider extracted (used as a relevance field). */
  entities?: string | null;
  /** Provider query that returned this record, if any. */
  matchedQueryId?: number | null;
  /** Small provider metadata kept for a limited time for debugging. */
  metadata?: Record<string, unknown> | null;
}

export interface NormalizedArticle {
  provider: string;
  providerRef: string | null;
  originalUrl: string;
  canonicalUrl: string;
  urlHash: string;
  title: string;
  normalizedTitle: string;
  titleHash: string;
  description: string | null;
  imageUrl: string | null;
  author: string | null;
  language: string;
  sourceDomain: string;
  sourceCountry: string | null;
  publishedAt: Date;
  entities: string | null;
  matchedQueryIds: number[];
  providerMetadata: Record<string, unknown> | null;
}
