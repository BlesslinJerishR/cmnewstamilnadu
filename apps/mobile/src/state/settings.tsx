import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { Appearance } from '../theme/theme';
import { readJson, writeJson } from './storage';

const KEY = 'settings:v1';

interface Settings {
  appearance: Appearance;
  recentSearches: string[];
}

interface SettingsContextValue extends Settings {
  loaded: boolean;
  setAppearance: (a: Appearance) => void;
  addRecentSearch: (q: string) => void;
  clearRecentSearches: () => void;
}

const defaults: Settings = { appearance: 'system', recentSearches: [] };
const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(defaults);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void readJson<Settings>(KEY, defaults).then((s) => {
      setSettings({ ...defaults, ...s });
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
    setAppearance: (appearance) => update((s) => ({ ...s, appearance })),
    addRecentSearch: (q) =>
      update((s) => {
        const t = q.trim();
        if (t.length < 2) return s;
        return { ...s, recentSearches: [t, ...s.recentSearches.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, 10) };
      }),
    clearRecentSearches: () => update((s) => ({ ...s, recentSearches: [] })),
  };
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
