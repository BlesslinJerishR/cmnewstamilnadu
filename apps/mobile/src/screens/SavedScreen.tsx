import { useCallback } from 'react';
import { FlatList, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ArticleSummary } from '@cmnews/shared';
import { ArticleCard } from '../components/ArticleCard';
import { Empty, T } from '../components/ui';
import { RootStackParamList } from '../navigation/types';
import { useAuth } from '../state/auth';
import { useBookmarks } from '../state/bookmarks';
import { spacing, useTheme } from '../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Tabs'>;

export function SavedScreen({ navigation }: Props) {
  const { bg } = useTheme();
  const { list, syncing } = useBookmarks();
  const { user } = useAuth();
  const open = useCallback((a: ArticleSummary) => navigation.navigate('Article', { id: a.id, summary: a }), [navigation]);
  return (
    <FlatList
      style={{ backgroundColor: bg }}
      data={list}
      keyExtractor={(s) => s.article.id}
      renderItem={({ item }) => <ArticleCard article={item.article} onPress={open} />}
      ListHeaderComponent={
        <T variant="small" style={{ padding: spacing.lg, paddingBottom: spacing.sm }}>
          {user ? (syncing ? 'Syncing with your account…' : `Synced with ${user.email}`) : 'Saved on this device. Sign in from Settings to sync across devices.'}
        </T>
      }
      ListEmptyComponent={
        <Empty title="Nothing saved yet" message="Tap Save on any article to keep it here, even offline." action={{ label: 'Browse latest', onPress: () => navigation.navigate('Tabs', { screen: 'Latest' }) }} />
      }
    />
  );
}
