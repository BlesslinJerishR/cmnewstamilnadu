import Constants from 'expo-constants';

const DEV_API_PORT = 3000;

/**
 * In development (Expo Go / dev client) the phone already reaches this computer to load the
 * JavaScript bundle; `hostUri` is that address (e.g. "192.168.1.20:8081"). The API runs on the
 * same computer, so we reuse its host with the API port. "localhost" would point at the phone.
 */
function devServerApiUrl(): string | undefined {
  if (!__DEV__) return undefined;
  const hostUri = Constants.expoConfig?.hostUri;
  const host = hostUri?.split(':')[0];
  return host ? `http://${host}:${DEV_API_PORT}` : undefined;
}

/**
 * Backend base URL, in order of precedence:
 *  1. EXPO_PUBLIC_API_BASE_URL at build/start time (e.g. https://api.example.org)
 *  2. in development, the computer running `expo start` on port 3000
 *  3. `expo.extra.apiBaseUrl` from app.json
 * The app never talks to GDELT or any other news provider — only to our own API.
 */
const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL;
const fromConfig = (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl;

export const API_BASE_URL = (fromEnv || devServerApiUrl() || fromConfig || 'http://localhost:3000').replace(/\/+$/, '');
export const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';

/** AsyncStorage key of the persisted TanStack Query cache (offline news). */
export const QUERY_CACHE_KEY = 'cmnews.query-cache.v1';
