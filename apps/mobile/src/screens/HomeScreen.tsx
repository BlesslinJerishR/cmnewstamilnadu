import { useCallback } from 'react';
import { Pressable, RefreshControl, SectionList, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ArticleSummary } from '@cmnews/shared';
import { useFeed } from '../api/queries';
import { ArticleCard } from '../components/ArticleCard';
import { OfflineBanner } from '../components/OfflineBanner';
import { Empty, ErrorState, Loading, T } from '../components/ui';
import { RootStackParamList } from '../navigation/types';
import { spacing, useTheme } from '../theme/theme';
import { formatIst } from '../utils/date';

type Props = NativeStackScreenProps<RootStackParamList, 'Tabs'>;

/** Server-driven home: the API decides which sections exist and in which order. */
export function HomeScreen({ navigation }: Props) {
  const { fg, bg } = useTheme();
  const feed = useFeed();
  const open = useCallback((a: ArticleSummary) => navigation.navigate('Article', { id: a.id, summary: a }), [navigation]);

  if (feed.isPending) return <Loading label="Loading today's coverage…" />;
  if (feed.isError && !feed.data) return <ErrorState error={feed.error} onRetry={() => void feed.refetch()} />;

  const sections = (feed.data?.sections ?? []).map((s) => ({ ...s, data: s.items }));
  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <OfflineBanner />
      <SectionList
        sections={sections}
        keyExtractor={(a, i) => `${a.id}-${i}`}
        stickySectionHeadersEnabled={false}
        renderItem={({ item, index, section }) => <ArticleCard article={item} onPress={open} lead={section.key === 'latest' && index === 0} />}
        renderSectionHeader={({ section }) => (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.sm, borderBottomWidth: 3, borderBottomColor: fg }}>
            <T variant="title">{section.title}</T>
            <Pressable
              accessibilityRole="link"
              hitSlop={12}
              onPress={() =>
                section.categorySlug
                  ? navigation.navigate('Category', { slug: section.categorySlug, name: section.title })
                  : navigation.navigate('Tabs', { screen: 'Latest' })
              }
            >
              <T variant="meta">See all →</T>
            </Pressable>
          </View>
        )}
        ListHeaderComponent={
          feed.data ? (
            <T variant="small" style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
              Updated {formatIst(feed.data.generatedAt)}
            </T>
          ) : null
        }
        ListEmptyComponent={<Empty title="No news yet" message="Coverage appears here as soon as it is collected." />}
        refreshControl={<RefreshControl refreshing={feed.isRefetching} onRefresh={() => void feed.refetch()} tintColor={fg} colors={[fg]} progressBackgroundColor={bg} />}
        contentContainerStyle={{ paddingBottom: spacing.xl }}
      />
    </View>
  );
}
