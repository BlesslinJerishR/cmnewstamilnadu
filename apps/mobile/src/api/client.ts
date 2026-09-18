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
import { demoApi } from './demo-data';

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

/**
 * DEMO MODE: Using offline demo data so the app works without a backend.
 * To switch back to the real API, replace `demoApi` calls below with the
 * original `request()` calls (commented alongside each method).
 */
export const api = {
  feed: (_signal?: AbortSignal) => demoApi.feed(),                                                     // request<FeedResponse>('GET', '/feed', { signal })
  latest: (cursor?: string, _signal?: AbortSignal) => demoApi.latest(cursor),                          // request<Paginated<ArticleSummary>>('GET', '/news/latest', { query: { cursor, limit: 20 }, signal })
  byCategory: (slug: string, cursor?: string, _signal?: AbortSignal) => demoApi.byCategory(slug, cursor), // request(...)
  bySource: (domain: string, cursor?: string, _signal?: AbortSignal) => demoApi.bySource(domain, cursor), // request(...)
  byDate: (date: string, cursor?: string, _signal?: AbortSignal) => demoApi.byDate(date, cursor),         // request(...)
  search: (q: string, sort: 'relevance' | 'latest', cursor?: string, _signal?: AbortSignal) => demoApi.search(q, sort, cursor), // request(...)
  suggest: (q: string, _signal?: AbortSignal) => demoApi.suggest(q),                                   // request(...)
  article: (id: string, _signal?: AbortSignal) => demoApi.article(id),                                 // request(...)
  categories: (_signal?: AbortSignal) => demoApi.categories(),                                         // request(...)
  sources: (_signal?: AbortSignal) => demoApi.sources(),                                               // request(...)

  // Auth and bookmarks are no-ops in demo mode.
  register: (_email: string, _password: string): Promise<AuthResponse> => Promise.reject(new ApiError('Demo mode — registration disabled.', 0, 'demo')),
  login: (_email: string, _password: string): Promise<AuthResponse> => Promise.reject(new ApiError('Demo mode — login disabled.', 0, 'demo')),
  logout: () => Promise.resolve(undefined as void),
  me: () => Promise.reject(new ApiError('Demo mode — not signed in.', 0, 'demo')),
  bookmarks: (_cursor?: string) => Promise.resolve({ items: [], nextCursor: null } as Paginated<BookmarkItem>),
  addBookmark: (_id: string) => Promise.resolve(undefined as void),
  removeBookmark: (_id: string) => Promise.resolve(undefined as void),
  importBookmarks: (_articleIds: string[]) => Promise.resolve({ imported: 0 }),
};

