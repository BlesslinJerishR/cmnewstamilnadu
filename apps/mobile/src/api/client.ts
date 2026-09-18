import type {
  ArticleDetail,
  ArticleSummary,
  AuthResponse,
  BookmarkItem,
  Category,
  FeedResponse,
  Paginated,
  SearchResponse,
  Source,
  UserProfile,
} from '@cmnews/shared';
import { API_BASE_URL } from '../config';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

let authToken: string | null = null;
export function setAuthToken(token: string | null): void {
  authToken = token;
}

type Query = Record<string, string | number | undefined | null>;

function buildUrl(path: string, query?: Query): string {
  const params = Object.entries(query ?? {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return `${API_BASE_URL}/api/v1${path}${params ? `?${params}` : ''}`;
}

async function request<T>(method: string, path: string, opts: { query?: Query; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  opts.signal?.addEventListener('abort', () => controller.abort());
  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method,
      headers: {
        Accept: 'application/json',
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection.', 0, 'network');
  } finally {
    clearTimeout(timeout);
  }
  if (res.status === 204) return undefined as T;
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string } } | null)?.error;
    const message =
      res.status === 429
        ? 'Too many requests. Please wait a moment.'
        : res.status >= 500
          ? 'The server is having trouble. Please try again.'
          : (err?.message ?? `Request failed (${res.status})`);
    throw new ApiError(message, res.status, err?.code ?? `http_${res.status}`);
  }
  return json as T;
}

export const api = {
  feed: (signal?: AbortSignal) => request<FeedResponse>('GET', '/feed', { signal }),
  latest: (cursor?: string, signal?: AbortSignal) => request<Paginated<ArticleSummary>>('GET', '/news/latest', { query: { cursor, limit: 20 }, signal }),
  byCategory: (slug: string, cursor?: string, signal?: AbortSignal) =>
    request<Paginated<ArticleSummary>>('GET', `/news/by-category/${encodeURIComponent(slug)}`, { query: { cursor, limit: 20 }, signal }),
  bySource: (domain: string, cursor?: string, signal?: AbortSignal) =>
    request<Paginated<ArticleSummary>>('GET', '/news', { query: { source: domain, cursor, limit: 20 }, signal }),
  byDate: (date: string, cursor?: string, signal?: AbortSignal) =>
    request<Paginated<ArticleSummary>>('GET', '/news/by-date', { query: { date, cursor, limit: 20 }, signal }),
  search: (q: string, sort: 'relevance' | 'latest', cursor?: string, signal?: AbortSignal) =>
    request<SearchResponse>('GET', '/news/search', { query: { q, sort, cursor, limit: 20 }, signal }),
  suggest: (q: string, signal?: AbortSignal) => request<{ suggestions: string[] }>('GET', '/news/suggest', { query: { q }, signal }),
  article: (id: string, signal?: AbortSignal) => request<ArticleDetail>('GET', `/news/${encodeURIComponent(id)}`, { signal }),
  categories: (signal?: AbortSignal) => request<{ items: Category[] }>('GET', '/categories', { signal }),
  sources: (signal?: AbortSignal) => request<{ items: Source[] }>('GET', '/sources', { signal }),

  register: (email: string, password: string) => request<AuthResponse>('POST', '/auth/register', { body: { email, password } }),
  login: (email: string, password: string) => request<AuthResponse>('POST', '/auth/login', { body: { email, password } }),
  logout: () => request<void>('POST', '/auth/logout'),
  me: () => request<UserProfile>('GET', '/me'),
  bookmarks: (cursor?: string) => request<Paginated<BookmarkItem>>('GET', '/me/bookmarks', { query: { cursor, limit: 50 } }),
  addBookmark: (id: string) => request<void>('PUT', `/me/bookmarks/${encodeURIComponent(id)}`),
  removeBookmark: (id: string) => request<void>('DELETE', `/me/bookmarks/${encodeURIComponent(id)}`),
  importBookmarks: (articleIds: string[]) => request<{ imported: number }>('POST', '/me/bookmarks/import', { body: { articleIds } }),
};
