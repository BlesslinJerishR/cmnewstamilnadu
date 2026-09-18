import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import type { UserProfile } from '@cmnews/shared';
import { ApiError, api, setAuthToken } from '../api/client';
import { tokenStore } from './tokenStore';

const TOKEN_KEY = 'cmnews.session';

interface AuthContextValue {
  user: UserProfile | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Accounts are optional; they only sync bookmarks across devices. The session token lives in
 * the platform keystore (expo-secure-store), never in plain AsyncStorage.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const token = await tokenStore.get(TOKEN_KEY).catch(() => null);
        if (token) {
          setAuthToken(token);
          try {
            setUser(await api.me());
          } catch (err) {
            if (err instanceof ApiError && err.status === 401) {
              setAuthToken(null);
              await tokenStore.remove(TOKEN_KEY);
            }
          }
        }
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const start = useCallback(async (token: string, profile: UserProfile) => {
    await tokenStore.set(TOKEN_KEY, token);
    setAuthToken(token);
    setUser(profile);
  }, []);

  const value: AuthContextValue = {
    user,
    ready,
    login: async (email, password) => {
      const r = await api.login(email, password);
      await start(r.token, r.user);
    },
    register: async (email, password) => {
      const r = await api.register(email, password);
      await start(r.token, r.user);
    },
    logout: async () => {
      await api.logout().catch(() => undefined);
      setAuthToken(null);
      setUser(null);
      await tokenStore.remove(TOKEN_KEY).catch(() => undefined);
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
