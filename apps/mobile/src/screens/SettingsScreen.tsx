import { ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChevronRight, Eraser, Info, Languages, LogOut, Newspaper, Shield, User } from '../components/icons';
import { Icon, IconComponent, Text } from '../components/primitives';
import { API_BASE_URL, APP_VERSION, QUERY_CACHE_KEY } from '../config';
import { useAppNavigation } from '../navigation/useAppNavigation';
import { useAuth } from '../state/auth';
import { color, layout, space } from '../theme/tokens';

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      <Text variant="overline" tone="subtle" style={styles.groupTitle} accessibilityRole="header">
        {title}
      </Text>
      <View style={styles.groupBody}>{children}</View>
    </View>
  );
}

function Row({ icon, label, value, onPress, destructive }: { icon: IconComponent; label: string; value?: string; onPress?: () => void; destructive?: boolean }) {
  const content = (
    <View style={styles.row}>
      <Icon as={icon} size={20} />
      <Text variant="label" style={{ flex: 1, fontWeight: destructive ? '700' : '600' }} numberOfLines={1}>
        {label}
      </Text>
      {value ? (
        <Text variant="bodySmall" tone="subtle" numberOfLines={1} style={{ maxWidth: '45%' }}>
          {value}
        </Text>
      ) : null}
      {onPress ? <Icon as={ChevronRight} size={18} color={color.fgSubtle} /> : null}
    </View>
  );
  if (!onPress) return <View accessible accessibilityLabel={`${label}${value ? `: ${value}` : ''}`}>{content}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => pressed && { backgroundColor: color.surface }}>
      {content}
    </Pressable>
  );
}

export function SettingsScreen() {
  const navigation = useAppNavigation();
  const { user, logout } = useAuth();
  const client = useQueryClient();

  const clearCache = () =>
    Alert.alert('Clear offline stories?', 'Downloaded stories will be removed from this device. Saved stories are kept.', [
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
    <ScrollView style={{ backgroundColor: color.bg }} contentContainerStyle={styles.content}>
      <View style={styles.inner}>
        <Text variant="display" accessibilityRole="header" style={styles.title}>
          Settings
        </Text>

        <Group title="Account">
          {user ? (
            <>
              <Row icon={User} label="Signed in" value={user.email} />
              <Row icon={LogOut} label="Sign out" onPress={() => void logout()} destructive />
            </>
          ) : (
            <Row icon={User} label="Sign in to sync saved stories" onPress={() => navigation.navigate('Account')} />
          )}
        </Group>

        <Group title="Reading">
          <Row icon={Languages} label="Language" value="English" />
          <Row icon={Newspaper} label="Sources" onPress={() => navigation.navigate('Sources')} />
        </Group>

        <Group title="Storage">
          <Row icon={Eraser} label="Clear offline stories" onPress={clearCache} />
        </Group>

        <Group title="About">
          <Row icon={Info} label="About TNigazhvu" onPress={() => navigation.navigate('About')} />
          <Row icon={Shield} label="Privacy" onPress={() => navigation.navigate('Privacy')} />
          <Row icon={Info} label="Version" value={APP_VERSION} />
        </Group>

        <Text variant="meta" tone="subtle" style={styles.server} selectable>
          {API_BASE_URL.replace(/^https?:\/\//, '')}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: space[12] },
  inner: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', paddingHorizontal: layout.gutter },
  title: { paddingTop: space[2], paddingBottom: space[2] },
  group: { marginTop: space[8] },
  groupTitle: { marginBottom: space[2] },
  groupBody: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[4], minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.border },
  server: { marginTop: space[8], textAlign: 'center' },
});
