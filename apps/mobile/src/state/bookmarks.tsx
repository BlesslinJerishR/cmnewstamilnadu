import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ArticleSummary } from '@cmnews/shared';
import { api } from '../api/client';
import { useAuth } from './auth';
import { readJson, writeJson } from './storage';

const KEY = 'bookmarks:v1';

interface Saved {
  article: ArticleSummary;
  savedAt: string;
}

interface Stored {
  items: Record<string, Saved>;
  /** Removals made while offline, sent to the server on the next sync. */
  pendingRemovals: string[];
}

interface BookmarksContextValue {
  list: Saved[];
  isSaved: (id: string) => boolean;
  toggle: (article: ArticleSummary) => void;
  syncing: boolean;
  sync: () => Promise<void>;
}

const BookmarksContext = createContext<BookmarksContextValue | null>(null);

/**
 * Bookmarks are stored on the device first (with a copy of the article card so they work
 * offline). When signed in they are also synced to the server, which merges devices.
 */
export function BookmarksProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<Stored>({ items: {}, pendingRemovals: [] });
  const [syncing, setSyncing] = useState(false);
  const loaded = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    void readJson<Stored>(KEY, { items: {}, pendingRemovals: [] }).then((s) => {
      loaded.current = true;
      setState(s);
    });
  }, []);

  const persist = useCallback((next: Stored) => {
    setState(next);
    void writeJson(KEY, next);
  }, []);

  const sync = useCallback(async () => {
    if (!user || !loaded.current) return;
    setSyncing(true);
    try {
      const current = stateRef.current;
      for (const id of current.pendingRemovals) await api.removeBookmark(id).catch(() => undefined);
      const localIds = Object.keys(current.items);
      for (let i = 0; i < localIds.length; i += 500) await api.importBookmarks(localIds.slice(i, i + 500));
      const merged: Record<string, Saved> = { ...current.items };
      let cursor: string | undefined;
      for (let page = 0; page < 20; page++) {
        const res = await api.bookmarks(cursor);
        for (const b of res.items) merged[b.article.id] = merged[b.article.id] ?? { article: b.article, savedAt: b.bookmarkedAt };
        if (!res.nextCursor) break;
        cursor = res.nextCursor;
      }
      persist({ items: merged, pendingRemovals: [] });
    } catch {
      // offline or server error: local bookmarks stay intact, sync runs again later
    } finally {
      setSyncing(false);
    }
  }, [user, persist]);

  useEffect(() => {
    if (user) void sync();
  }, [user, sync]);

  const toggle = useCallback(
    (article: ArticleSummary) => {
      const current = stateRef.current;
      const items = { ...current.items };
      let pendingRemovals = current.pendingRemovals;
      if (items[article.id]) {
        delete items[article.id];
        if (user) {
          pendingRemovals = [...new Set([...pendingRemovals, article.id])];
          api.removeBookmark(article.id)
            .then(() => persist({ ...stateRef.current, pendingRemovals: stateRef.current.pendingRemovals.filter((x) => x !== article.id) }))
            .catch(() => undefined);
        }
      } else {
        items[article.id] = { article, savedAt: new Date().toISOString() };
        pendingRemovals = pendingRemovals.filter((x) => x !== article.id);
        if (user) api.addBookmark(article.id).catch(() => undefined);
      }
      persist({ items, pendingRemovals });
    },
    [user, persist],
  );

  const value = useMemo<BookmarksContextValue>(
    () => ({
      list: Object.values(state.items).sort((a, b) => b.savedAt.localeCompare(a.savedAt)),
      isSaved: (id) => Boolean(state.items[id]),
      toggle,
      syncing,
      sync,
    }),
    [state, toggle, syncing, sync],
  );
  return <BookmarksContext.Provider value={value}>{children}</BookmarksContext.Provider>;
}

export function useBookmarks(): BookmarksContextValue {
  const ctx = useContext(BookmarksContext);
  if (!ctx) throw new Error('useBookmarks must be used inside BookmarksProvider');
  return ctx;
}
