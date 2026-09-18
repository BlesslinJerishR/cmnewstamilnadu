import { InfiniteData, QueryClient, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ArticleDetail, ArticleSummary, Paginated, SearchResponse } from '@cmnews/shared';
import { ApiError, api } from './client';

const MINUTE = 60 * 1000;
export const DAY = 24 * 60 * MINUTE;

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Cached data is kept for a week so previously loaded news stays readable offline.
        gcTime: 7 * DAY,
        staleTime: 2 * MINUTE,
        retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
        networkMode: 'offlineFirst',
      },
    },
  });
}

export const keys = {
  feed: ['feed'] as const,
  latest: ['news', 'latest'] as const,
  category: (slug: string) => ['news', 'category', slug] as const,
  source: (domain: string) => ['news', 'source', domain] as const,
  search: (q: string, sort: string) => ['search', q, sort] as const,
  suggest: (q: string) => ['suggest', q] as const,
  article: (id: string) => ['article', id] as const,
  categories: ['categories'] as const,
  sources: ['sources'] as const,
};

export function useFeed() {
  return useQuery({ queryKey: keys.feed, queryFn: ({ signal }) => api.feed(signal) });
}

type Page = Paginated<ArticleSummary>;

function useArticleList(key: readonly unknown[], fetchPage: (cursor: string | undefined, signal: AbortSignal) => Promise<Page>, enabled = true) {
  return useInfiniteQuery<Page, Error, InfiniteData<Page>, readonly unknown[], string | undefined>({
    queryKey: key,
    queryFn: ({ pageParam, signal }) => fetchPage(pageParam, signal),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    // Keeps memory and the offline cache bounded for long scrolling sessions.
    maxPages: 10,
    enabled,
  });
}

export const useLatest = () => useArticleList(keys.latest, (c, s) => api.latest(c, s));
export const useCategoryNews = (slug: string) => useArticleList(keys.category(slug), (c, s) => api.byCategory(slug, c, s));
export const useSourceNews = (domain: string) => useArticleList(keys.source(domain), (c, s) => api.bySource(domain, c, s));

export function useSearch(q: string, sort: 'relevance' | 'latest') {
  const enabled = q.trim().length >= 2;
  return useInfiniteQuery<SearchResponse, Error, InfiniteData<SearchResponse>, readonly unknown[], string | undefined>({
    queryKey: keys.search(q.trim().toLowerCase(), sort),
    queryFn: ({ pageParam, signal }) => api.search(q.trim(), sort, pageParam, signal),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    maxPages: 5,
    enabled,
    staleTime: MINUTE,
    gcTime: 30 * MINUTE,
  });
}

export function useSuggestions(q: string) {
  return useQuery({
    queryKey: keys.suggest(q.trim().toLowerCase()),
    queryFn: ({ signal }) => api.suggest(q.trim(), signal),
    enabled: q.trim().length >= 2,
    staleTime: 5 * MINUTE,
    gcTime: 10 * MINUTE,
  });
}

/** Finds a summary for an article already present in any cached list, for instant rendering. */
function findCachedSummary(client: QueryClient, id: string): ArticleSummary | undefined {
  for (const [, data] of client.getQueriesData<unknown>({})) {
    const pages = (data as { pages?: Array<{ items?: ArticleSummary[] }> } | undefined)?.pages;
    const sections = (data as { sections?: Array<{ items: ArticleSummary[] }> } | undefined)?.sections;
    const lists = pages?.map((p) => p.items ?? []) ?? sections?.map((s) => s.items) ?? [];
    for (const list of lists) {
      const hit = list.find((a) => a.id === id);
      if (hit) return hit;
    }
  }
  return undefined;
}

export function useArticle(id: string, initial?: ArticleSummary) {
  const client = useQueryClient();
  return useQuery<ArticleDetail>({
    queryKey: keys.article(id),
    queryFn: ({ signal }) => api.article(id, signal),
    staleTime: 10 * MINUTE,
    placeholderData: () => {
      const summary = initial ?? findCachedSummary(client, id);
      return summary
        ? { ...summary, language: 'en', sourceCountry: null, author: null, firstSeenAt: summary.publishedAt, alsoReportedBy: [] }
        : undefined;
    },
  });
}

export function useCategories() {
  return useQuery({ queryKey: keys.categories, queryFn: ({ signal }) => api.categories(signal), staleTime: 60 * MINUTE });
}

export function useSources() {
  return useQuery({ queryKey: keys.sources, queryFn: ({ signal }) => api.sources(signal), staleTime: 60 * MINUTE });
}

/** Human label for a category slug ("law-and-order" → "Law and Order"), from the cached list. */
export function useCategoryLabel(slug?: string): string | null {
  const { data } = useCategories();
  if (!slug) return null;
  return data?.items.find((c) => c.slug === slug)?.name ?? slug.replace(/-/g, ' ');
}

/** "More in <category>": the first page of the article's main category, minus the article itself. */
export function useRelated(slug: string | undefined, excludeId: string) {
  return useQuery({
    queryKey: [...keys.category(slug ?? ''), 'related'],
    queryFn: ({ signal }) => api.byCategory(slug!, undefined, signal),
    enabled: !!slug,
    staleTime: 5 * MINUTE,
    select: (page) => page.items.filter((a) => a.id !== excludeId).slice(0, 5),
  });
}
