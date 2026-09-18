import { useEffect, useMemo } from 'react';
import { AppState, Platform } from 'react-native';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
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
import { ThemeProvider, useTheme } from './theme/theme';

// TanStack Query learns about connectivity and app focus from React Native.
onlineManager.setEventListener((setOnline) => NetInfo.addEventListener((s) => setOnline(s.isConnected !== false)));

const queryClient = createQueryClient();
const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: QUERY_CACHE_KEY, throttleTime: 2000 });

function Navigation() {
  const theme = useTheme();
  const navTheme = useMemo(() => {
    const base = theme.dark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: { primary: theme.fg, background: theme.bg, card: theme.bg, text: theme.fg, border: theme.fg, notification: theme.fg },
    };
  }, [theme]);
  return (
    <NavigationContainer theme={navTheme} linking={linking}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <RootNavigator />
    </NavigationContainer>
  );
}

function Themed() {
  const settings = useSettings();
  if (!settings.loaded) return null;
  return (
    <ThemeProvider appearance={settings.appearance}>
      <Navigation />
    </ThemeProvider>
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
            shouldDehydrateQuery: (q) => q.state.status === 'success' && q.queryKey[0] !== 'suggest',
          },
        }}
      >
        <SettingsProvider>
          <AuthProvider>
            <BookmarksProvider>
              <Themed />
            </BookmarksProvider>
          </AuthProvider>
        </SettingsProvider>
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}
