import { useCallback } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Bookmark, Settings } from 'lucide-react-native';
import type { ArticleSummary } from '@cmnews/shared';
import { BookmarkButton, CompactArticle } from '../components/article';
import { AppHeader, EmptyState } from '../components/chrome';
import { IconButton, Text } from '../components/primitives';
import { useAppNavigation } from '../navigation/useAppNavigation';
import { useAuth } from '../state/auth';
import { useBookmarks } from '../state/bookmarks';
import { color, layout, space } from '../theme/tokens';

export function SavedScreen() {
  const navigation = useAppNavigation();
  const { list, syncing } = useBookmarks();
  const { user } = useAuth();
  const open = useCallback((a: ArticleSummary) => navigation.navigate('Article', { id: a.id, summary: a }), [navigation]);
  const status = user ? (syncing ? 'Syncing…' : 'Synced to your account') : 'Saved on this device';
  return (
    <View style={styles.screen}>
      <AppHeader
        title="Saved"
        kicker={list.length ? `${list.length} ${list.length === 1 ? 'story' : 'stories'} · ${status}` : status}
        actions={<IconButton icon={Settings} label="Settings" onPress={() => navigation.navigate('Settings')} />}
      />
      <FlatList
        data={list}
        keyExtractor={(s) => s.article.id}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: space[10] }}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <CompactArticle article={item.article} onPress={open} trailing={<BookmarkButton article={item.article} />} />
          </View>
        )}
        ListEmptyComponent={
          <EmptyState
            icon={Bookmark}
            title="Nothing saved yet"
            message="Tap the bookmark on any story to keep it here. Saved stories work offline."
            action={{ label: 'Browse latest', onPress: () => navigation.navigate('Tabs', { screen: 'Latest' }) }}
          />
        }
        ListFooterComponent={
          !user && list.length > 0 ? (
            <Text variant="bodySmall" tone="subtle" style={styles.note}>
              Sign in from Settings to keep saved stories in sync across devices.
            </Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  row: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', paddingHorizontal: layout.gutter },
  note: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', paddingHorizontal: layout.gutter, paddingTop: space[6] },
});
