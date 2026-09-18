import { useCallback, useMemo } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Newspaper, Search, Settings } from 'lucide-react-native';
import type { ArticleSummary } from '@cmnews/shared';
import { useCategories, useFeed } from '../api/queries';
import { CompactArticle, FeaturedArticle, SectionHeader } from '../components/article';
import { AppHeader, CategorySelector, EmptyState, ErrorState, FeedSkeleton, OfflineNotice } from '../components/chrome';
import { Button, IconButton, Text } from '../components/primitives';
import { useAppNavigation } from '../navigation/useAppNavigation';
import { color, layout, space } from '../theme/tokens';
import { freshness } from '../utils/date';

type Row =
  | { kind: 'categories'; key: string }
  | { kind: 'featured'; key: string; article: ArticleSummary }
  | { kind: 'section'; key: string; title: string; slug: string | null }
  | { kind: 'story'; key: string; article: ArticleSummary }
  | { kind: 'more'; key: string };

const LATEST_ROWS = 5;
const SECTION_ROWS = 3;

/**
 * Home: server-driven sections laid out editorially. The newest story leads, then "Latest",
 * then one block per category. A story appears only once on the page.
 */
export function HomeScreen() {
  const navigation = useAppNavigation();
  const feed = useFeed();
  const categories = useCategories();
  const open = useCallback((a: ArticleSummary) => navigation.navigate('Article', { id: a.id, summary: a }), [navigation]);

  const rows = useMemo(() => {
    const sections = feed.data?.sections ?? [];
    const out: Row[] = [{ kind: 'categories', key: 'categories' }];
    const shown = new Set<string>();
    for (const s of sections) {
      const fresh = s.items.filter((a) => !shown.has(a.id));
      if (s.key === 'latest') {
        // Lead with the newest story that has a photo (among the first few); keep the rest in order.
        const leadIndex = Math.max(0, fresh.slice(0, 4).findIndex((a) => !!a.imageUrl));
        const lead = fresh[leadIndex];
        const rest = fresh.filter((_, i) => i !== leadIndex);
        if (lead) {
          out.push({ kind: 'featured', key: `featured-${lead.id}`, article: lead });
          shown.add(lead.id);
        }
        const list = rest.slice(0, LATEST_ROWS);
        if (list.length) {
          out.push({ kind: 'section', key: 'section-latest', title: 'Latest', slug: null });
          for (const a of list) {
            out.push({ kind: 'story', key: a.id, article: a });
            shown.add(a.id);
          }
        }
        continue;
      }
      const list = fresh.slice(0, SECTION_ROWS);
      if (!list.length) continue;
      out.push({ kind: 'section', key: `section-${s.key}`, title: s.title, slug: s.categorySlug });
      for (const a of list) {
        out.push({ kind: 'story', key: a.id, article: a });
        shown.add(a.id);
      }
    }
    if (out.length > 1) out.push({ kind: 'more', key: 'more' });
    return out;
  }, [feed.data]);

  const selectorItems = useMemo(
    () => [{ key: 'all', label: 'Top stories' }, ...(categories.data?.items ?? []).filter((c) => c.slug !== 'general').map((c) => ({ key: c.slug, label: c.name }))],
    [categories.data],
  );

  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
      if (item.kind === 'categories') {
        return (
          <View>
            <CategorySelector
              items={selectorItems}
              selected="all"
              onSelect={(key) => {
                if (key !== 'all') navigation.navigate('Category', { slug: key, name: selectorItems.find((i) => i.key === key)?.label });
              }}
            />
            {feed.dataUpdatedAt ? (
              <Text variant="meta" tone="subtle" style={styles.fresh}>
                {freshness(feed.dataUpdatedAt)}
              </Text>
            ) : null}
          </View>
        );
      }
      return (
        <View style={styles.row}>
          {item.kind === 'featured' ? (
            <FeaturedArticle article={item.article} onPress={open} />
          ) : item.kind === 'section' ? (
            <SectionHeader
              title={item.title}
              onSeeAll={() =>
                item.slug ? navigation.navigate('Category', { slug: item.slug, name: item.title }) : navigation.navigate('Tabs', { screen: 'Latest' })
              }
            />
          ) : item.kind === 'story' ? (
            <CompactArticle article={item.article} onPress={open} />
          ) : (
            <View style={styles.more}>
              <Button label="More news" variant="secondary" icon={Newspaper} onPress={() => navigation.navigate('Tabs', { screen: 'Latest' })} />
              <Text variant="meta" tone="subtle" style={styles.madeInIndia}>made in india.</Text>
            </View>
          )}
        </View>
      );
    },
    [open, navigation, selectorItems, feed.dataUpdatedAt],
  );

  const header = (
    <AppHeader
      brand
      title="News"
      kicker="Tamil Nadu · Chief Minister"
      actions={
        <>
          <IconButton icon={Search} label="Search news" onPress={() => navigation.navigate('Tabs', { screen: 'Search', params: { focus: Date.now() } })} />
          <IconButton icon={Settings} label="Settings" onPress={() => navigation.navigate('Settings')} />
        </>
      }
    />
  );

  return (
    <View style={styles.screen}>
      {header}
      <OfflineNotice />
      {feed.isPending ? (
        <FeedSkeleton />
      ) : feed.isError && !feed.data ? (
        <ErrorState error={feed.error} onRetry={() => void feed.refetch()} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          renderItem={renderItem}
          ListEmptyComponent={<EmptyState icon={Newspaper} title="No news yet" message="New coverage appears here as soon as it is published." />}
          refreshControl={<RefreshControl refreshing={feed.isRefetching} onRefresh={() => void feed.refetch()} tintColor={color.fg} colors={[color.fg]} />}
          contentContainerStyle={styles.content}
          initialNumToRender={6}
          windowSize={9}
          removeClippedSubviews
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  content: { paddingBottom: space[10] },
  row: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', paddingHorizontal: layout.gutter },
  fresh: { paddingHorizontal: layout.gutter, paddingTop: space[1], paddingBottom: space[3], width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center' },
  more: { paddingTop: space[8] },
  madeInIndia: { textAlign: 'center', marginTop: space[4], },
});
