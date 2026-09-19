import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { ChevronRight, Newspaper } from '../components/icons';
import { useSources } from '../api/queries';
import { EmptyState, ErrorState, FeedSkeleton } from '../components/chrome';
import { Icon, Text } from '../components/primitives';
import { useAppNavigation } from '../navigation/useAppNavigation';
import { color, layout, space } from '../theme/tokens';

export function SourcesScreen() {
  const navigation = useAppNavigation();
  const q = useSources();
  if (q.isPending) return <FeedSkeleton featured={false} rows={6} />;
  if (q.isError && !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  return (
    <FlatList
      style={{ backgroundColor: color.bg }}
      data={q.data?.items ?? []}
      keyExtractor={(s) => s.domain}
      contentContainerStyle={{ paddingBottom: space[10] }}
      ListHeaderComponent={
        <View style={styles.head}>
          <Text variant="display" accessibilityRole="header">
            Sources
          </Text>
          <Text variant="body" tone="muted">
            Publishers whose reporting appears in the app, by number of stories.
          </Text>
        </View>
      }
      ListEmptyComponent={<EmptyState icon={Newspaper} title="No sources yet" />}
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${item.name}, ${item.articleCount} stories`}
          onPress={() => navigation.navigate('Source', { domain: item.domain, name: item.name })}
          style={({ pressed }) => pressed && { backgroundColor: color.surface }}
        >
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text variant="label">{item.name}</Text>
              <Text variant="meta" tone="subtle">
                {item.domain}
              </Text>
            </View>
            <Text variant="meta" tone="muted">
              {item.articleCount}
            </Text>
            <Icon as={ChevronRight} size={18} />
          </View>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  head: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', paddingHorizontal: layout.gutter, paddingTop: space[2], paddingBottom: space[4], gap: space[2] },
  row: {
    width: '100%',
    maxWidth: layout.maxWidth,
    alignSelf: 'center',
    paddingHorizontal: layout.gutter,
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border,
  },
});
