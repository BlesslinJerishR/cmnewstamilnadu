import { ReactElement, useCallback, useMemo } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Newspaper } from 'lucide-react-native';
import type { ArticleSummary, Paginated } from '@cmnews/shared';
import { RootStackParamList } from '../navigation/types';
import { color, layout, space } from '../theme/tokens';
import { dayLabel } from '../utils/date';
import { CompactArticle, FeaturedArticle } from './article';
import { EmptyState, ErrorState, FeedSkeleton } from './chrome';
import { Text } from './primitives';

type Row =
  | { kind: 'featured'; key: string; article: ArticleSummary }
  | { kind: 'story'; key: string; article: ArticleSummary }
  | { kind: 'day'; key: string; label: string };

/**
 * Virtualised editorial feed shared by Latest, Category, Source and Search results:
 * optional lead story, optional day headings, infinite scroll and native pull-to-refresh.
 * Rendering stays in the order the API returns (search relevance is preserved).
 */
export function ArticleFeed<P extends Paginated<ArticleSummary>>({
  query,
  header,
  featureFirst,
  groupByDay,
  hideCategory,
  empty,
}: {
  query: UseInfiniteQueryResult<InfiniteData<P>, Error>;
  header?: ReactElement | null;
  featureFirst?: boolean;
  groupByDay?: boolean;
  /** On a topic page every story shares the topic; don't repeat it on each row. */
  hideCategory?: boolean;
  empty: { title: string; message?: string };
}) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const open = useCallback((a: ArticleSummary) => navigation.navigate('Article', { id: a.id, summary: a }), [navigation]);

  const rows = useMemo(() => {
    const out: Row[] = [];
    const seen = new Set<string>();
    let lastDay = '';
    for (const page of query.data?.pages ?? []) {
      for (const a of page.items) {
        if (seen.has(a.id)) continue;
        seen.add(a.id);
        if (featureFirst && out.length === 0) {
          out.push({ kind: 'featured', key: `f-${a.id}`, article: a });
          continue;
        }
        if (groupByDay) {
          const day = dayLabel(a.publishedAt);
          if (day !== lastDay) {
            out.push({ kind: 'day', key: `d-${day}-${a.id}`, label: day });
            lastDay = day;
          }
        }
        out.push({ kind: 'story', key: a.id, article: a });
      }
    }
    return out;
  }, [query.data, featureFirst, groupByDay]);

  const renderItem = useCallback(
    ({ item }: { item: Row }) => (
      <View style={styles.row}>
        {item.kind === 'featured' ? (
          <FeaturedArticle article={item.article} onPress={open} showCategory={!hideCategory} />
        ) : item.kind === 'day' ? (
          <View style={styles.day}>
            <Text variant="overline" accessibilityRole="header">
              {item.label}
            </Text>
          </View>
        ) : (
          <CompactArticle article={item.article} onPress={open} showCategory={!hideCategory} />
        )}
      </View>
    ),
    [open, hideCategory],
  );

  if (query.isPending && rows.length === 0) {
    return (
      <View style={styles.fill}>
        {header}
        <FeedSkeleton featured={featureFirst} />
      </View>
    );
  }
  if (query.isError && rows.length === 0) {
    return (
      <View style={styles.fill}>
        {header}
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </View>
    );
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(r) => r.key}
      renderItem={renderItem}
      ListHeaderComponent={header}
      ListEmptyComponent={<EmptyState icon={Newspaper} title={empty.title} message={empty.message} />}
      ListFooterComponent={
        rows.length > 0 ? (
          query.isFetchingNextPage ? (
            <ActivityIndicator color={color.fg} style={styles.footer} />
          ) : !query.hasNextPage ? (
            <Text variant="meta" tone="subtle" style={[styles.footer, { textAlign: 'center' }]}>
              You’re all caught up
            </Text>
          ) : (
            <View style={styles.footer} />
          )
        ) : null
      }
      onEndReachedThreshold={0.6}
      onEndReached={() => {
        if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
      }}
      refreshControl={
        <RefreshControl refreshing={query.isRefetching && !query.isFetchingNextPage} onRefresh={() => void query.refetch()} tintColor={color.fg} colors={[color.fg]} />
      }
      style={styles.fill}
      contentContainerStyle={styles.content}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      initialNumToRender={8}
      maxToRenderPerBatch={8}
      windowSize={9}
      removeClippedSubviews
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: color.bg },
  content: { flexGrow: 1, paddingBottom: space[8] },
  row: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', paddingHorizontal: layout.gutter },
  day: { paddingTop: space[8], paddingBottom: space[2], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.fg },
  footer: { marginVertical: space[8] },
});
