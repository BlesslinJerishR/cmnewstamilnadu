import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { ArrowUpRight, LayoutGrid } from '../components/icons';
import { useCategories } from '../api/queries';
import { AppHeader, EmptyState, ErrorState, FeedSkeleton, OfflineNotice } from '../components/chrome';
import { Icon, Text } from '../components/primitives';
import { useAppNavigation } from '../navigation/useAppNavigation';
import { color, layout, space } from '../theme/tokens';

/** Index of topics: a numbered editorial list, not a grid of coloured tiles. */
export function CategoriesScreen() {
  const navigation = useAppNavigation();
  const q = useCategories();
  const items = (q.data?.items ?? []).filter((c) => c.slug !== 'general');
  return (
    <View style={styles.screen}>
      <AppHeader title="Topics" kicker="Browse by subject" />
      <OfflineNotice />
      {q.isPending ? (
        <FeedSkeleton featured={false} rows={6} />
      ) : q.isError && !q.data ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.slug}
          contentContainerStyle={{ paddingBottom: space[10] }}
          ListEmptyComponent={<EmptyState icon={LayoutGrid} title="No topics" />}
          renderItem={({ item, index }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.name}. ${item.description ?? ''}`}
              onPress={() => navigation.navigate('Category', { slug: item.slug, name: item.name })}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: color.surface }]}
            >
              <View style={styles.inner}>
                <Text variant="meta" tone="subtle" style={styles.index}>
                  {String(index + 1).padStart(2, '0')}
                </Text>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="section">{item.name}</Text>
                  {item.description ? (
                    <Text variant="bodySmall" tone="muted" numberOfLines={2}>
                      {item.description}
                    </Text>
                  ) : null}
                </View>
                <Icon as={ArrowUpRight} size={18} />
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  row: { width: '100%' },
  inner: {
    width: '100%',
    maxWidth: layout.maxWidth,
    alignSelf: 'center',
    paddingHorizontal: layout.gutter,
    paddingVertical: space[5],
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border,
  },
  index: { width: 22 },
});
