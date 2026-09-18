import { Alert, Pressable, ScrollView, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Button, Rule, T } from '../components/ui';
import { RootStackParamList } from '../navigation/types';
import { useAuth } from '../state/auth';
import { useSettings } from '../state/settings';
import { Appearance, spacing, useTheme } from '../theme/theme';
import { API_BASE_URL, APP_VERSION, QUERY_CACHE_KEY } from '../config';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

const APPEARANCES: Array<{ key: Appearance; label: string }> = [
  { key: 'system', label: 'Match system' },
  { key: 'light', label: 'Black on white' },
  { key: 'dark', label: 'White on black' },
];

function Row({ label, value, onPress, selected }: { label: string; value?: string; onPress: () => void; selected?: boolean }) {
  const { fg, bg } = useTheme();
  return (
    <Pressable
      accessibilityRole={selected === undefined ? 'button' : 'radio'}
      accessibilityState={selected === undefined ? undefined : { checked: selected }}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderBottomWidth: 1, borderBottomColor: fg, backgroundColor: pressed ? fg : bg })}
    >
      {({ pressed }) => (
        <>
          <T style={{ color: pressed ? bg : fg, fontWeight: selected ? '800' : '400' }}>{label}</T>
          <T style={{ color: pressed ? bg : fg, fontWeight: '800' }}>{selected === undefined ? (value ?? '→') : selected ? '●' : '○'}</T>
        </>
      )}
    </Pressable>
  );
}

function Heading({ children }: { children: string }) {
  return (
    <T variant="meta" style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.sm }}>
      {children}
    </T>
  );
}

export function SettingsScreen({ navigation }: Props) {
  const { bg } = useTheme();
  const settings = useSettings();
  const { user, logout } = useAuth();
  const client = useQueryClient();

  const clearCache = () =>
    Alert.alert('Clear offline news?', 'Downloaded news will be removed from this device. Saved articles are kept.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          client.clear();
          void AsyncStorage.removeItem(QUERY_CACHE_KEY);
        },
      },
    ]);

  return (
    <ScrollView style={{ backgroundColor: bg }} contentContainerStyle={{ paddingBottom: spacing.xl * 2 }}>
      <Heading>Appearance</Heading>
      <Rule />
      {APPEARANCES.map((a) => (
        <Row key={a.key} label={a.label} selected={settings.appearance === a.key} onPress={() => settings.setAppearance(a.key)} />
      ))}

      <Heading>Account</Heading>
      <Rule />
      {user ? (
        <>
          <Row label={user.email} value="" onPress={() => undefined} />
          <View style={{ padding: spacing.lg }}>
            <Button label="Sign out" variant="outline" onPress={() => void logout()} />
          </View>
        </>
      ) : (
        <Row label="Sign in to sync saved articles" onPress={() => navigation.navigate('Account')} />
      )}

      <Heading>Data</Heading>
      <Rule />
      <Row label="Clear offline news" onPress={clearCache} />
      <Row label="News sources" onPress={() => navigation.navigate('Sources')} />

      <Heading>About</Heading>
      <Rule />
      <Row label="About this app" onPress={() => navigation.navigate('About')} />
      <View style={{ padding: spacing.lg }}>
        <T variant="small">Version {APP_VERSION}</T>
        <T variant="small">Server: {API_BASE_URL}</T>
      </View>
    </ScrollView>
  );
}
