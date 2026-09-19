import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { focusManager, onlineManager } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { createQueryClient, DAY } from './api/queries';
import { APP_VERSION, QUERY_CACHE_KEY } from './config';
import { linking } from './navigation/linking';
import { RootNavigator } from './navigation/RootNavigator';
import { AuthProvider } from './state/auth';
import { BookmarksProvider } from './state/bookmarks';
import { SettingsProvider, useSettings } from './state/settings';
import { InAppUpdates } from './updates/InAppUpdates';
import { color } from './theme/tokens';

// TanStack Query learns about connectivity and app focus from React Native.
onlineManager.setEventListener((setOnline) => NetInfo.addEventListener((s) => setOnline(s.isConnected !== false)));

const queryClient = createQueryClient();
const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: QUERY_CACHE_KEY, throttleTime: 2000 });

/** White-first navigation theme; every surface and text colour comes from the tokens. */
const navTheme = {
  ...DefaultTheme,
  colors: { primary: color.fg, background: color.bg, card: color.bg, text: color.fg, border: color.border, notification: color.fg },
};

function Navigation() {
  const settings = useSettings();
  // Wait for persisted settings (recent searches) so the first render is complete.
  if (!settings.loaded) return null;
  return (
    <NavigationContainer theme={navTheme} linking={linking}>
      <StatusBar style="dark" />
      <RootNavigator />
      {/* Google Play in-app updates (Android release builds only); prompts wait until onboarding is done. */}
      <InAppUpdates promptsEnabled={settings.hasOnboarded} />
    </NavigationContainer>
  );
}

export default function App() {
  useEffect(() => {
    const sub = AppState.addEventListener('change', (status) => {
      if (Platform.OS !== 'web') focusManager.setFocused(status === 'active');
    });
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: 7 * DAY,
          buster: APP_VERSION,
          dehydrateOptions: {
            // Persist news for offline reading; skip transient search suggestions and failures.
            // Search results and suggestions are short-lived: persisting them would only grow
            // AsyncStorage (limited to a few MB on some Android devices) and slow every write.
            shouldDehydrateQuery: (q) => q.state.status === 'success' && q.queryKey[0] !== 'suggest' && q.queryKey[0] !== 'search',
          },
        }}
      >
        <SettingsProvider>
          <AuthProvider>
            <BookmarksProvider>
              <Navigation />
            </BookmarksProvider>
          </AuthProvider>
        </SettingsProvider>
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}
