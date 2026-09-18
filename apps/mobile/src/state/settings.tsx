import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { readJson, writeJson } from './storage';

const KEY = 'settings:v1';

interface Settings {
  recentSearches: string[];
  hasOnboarded: boolean;
}

interface SettingsContextValue extends Settings {
  loaded: boolean;
  addRecentSearch: (q: string) => void;
  clearRecentSearches: () => void;
  completeOnboarding: () => void;
}

const defaults: Settings = { recentSearches: [], hasOnboarded: false };
const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(defaults);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void readJson<Partial<Settings>>(KEY, defaults).then((s) => {
      setSettings({
        recentSearches: Array.isArray(s.recentSearches) ? s.recentSearches : [],
        hasOnboarded: typeof s.hasOnboarded === 'boolean' ? s.hasOnboarded : false,
      });
      setLoaded(true);
    });
  }, []);

  const update = useCallback((fn: (s: Settings) => Settings) => {
    setSettings((prev) => {
      const next = fn(prev);
      void writeJson(KEY, next);
      return next;
    });
  }, []);

  const value: SettingsContextValue = {
    ...settings,
    loaded,
    addRecentSearch: (q) =>
      update((s) => {
        const t = q.trim();
        if (t.length < 2) return s;
        return { ...s, recentSearches: [t, ...s.recentSearches.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, 8) };
      }),
    clearRecentSearches: () => update((s) => ({ ...s, recentSearches: [] })),
    completeOnboarding: () => update((s) => ({ ...s, hasOnboarded: true })),
  };
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
