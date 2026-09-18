import { Pressable, ScrollView, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useArticle } from '../api/queries';
import { OfflineBanner } from '../components/OfflineBanner';
import { Button, Chip, ErrorState, Loading, Rule, T } from '../components/ui';
import { RootStackParamList } from '../navigation/types';
import { useBookmarks } from '../state/bookmarks';
import { spacing, useTheme } from '../theme/theme';
import { formatIst } from '../utils/date';
import { openArticle, shareArticle } from '../utils/links';

type Props = NativeStackScreenProps<RootStackParamList, 'Article'>;

/**
 * Article detail. We show the headline, publisher, time and a short description only;
 * the full story is always read on the publisher's own site.
 */
export function ArticleScreen({ route, navigation }: Props) {
  const theme = useTheme();
  const { fg, bg } = theme;
  const { id, summary } = route.params;
  const q = useArticle(id, summary);
  const bookmarks = useBookmarks();

  if (!q.data && q.isPending) return <Loading />;
  if (!q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const a = q.data;
  const saved = bookmarks.isSaved(a.id);

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <OfflineBanner />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl * 2 }}>
        <Pressable accessibilityRole="link" onPress={() => navigation.navigate('Source', { domain: a.sourceDomain, name: a.sourceName })} hitSlop={8}>
          <T variant="meta" style={{ textDecorationLine: 'underline' }}>
            {a.sourceName}
          </T>
        </Pressable>
        <T variant="display" style={{ marginTop: spacing.sm }}>
          {a.title}
        </T>
        <T variant="small" style={{ marginTop: spacing.sm }}>
          {formatIst(a.publishedAt)}
          {a.author ? ` · ${a.author}` : ''}
        </T>
        {a.categories.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.sm }}>
            {a.categories.map((c) => (
              <Chip key={c} label={c.replace(/-/g, ' ')} onPress={() => navigation.navigate('Category', { slug: c })} />
            ))}
          </View>
        ) : null}
        {a.description ? <T style={{ marginTop: spacing.lg }}>{a.description}</T> : null}

        <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
          <Button label={`Read the full story at ${a.sourceName}`} onPress={() => void openArticle(a.url, theme.dark)} accessibilityHint="Opens the publisher's website" />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button label={saved ? 'Saved ✓' : 'Save'} variant="outline" onPress={() => bookmarks.toggle(a)} style={{ flex: 1 }} />
            <Button label="Share" variant="outline" onPress={() => void shareArticle(a.title, a.url, a.sourceName)} style={{ flex: 1 }} />
          </View>
        </View>

        {a.alsoReportedBy.length > 0 ? (
          <View style={{ marginTop: spacing.xl }}>
            <Rule thick />
            <T variant="meta" style={{ marginTop: spacing.md, marginBottom: spacing.xs }}>
              Also reported by
            </T>
            {a.alsoReportedBy.map((r) => (
              <Pressable
                key={r.id}
                accessibilityRole="link"
                onPress={() => void openArticle(r.url, theme.dark)}
                style={({ pressed }) => ({ paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: fg, backgroundColor: pressed ? fg : bg })}
              >
                {({ pressed }) => (
                  <>
                    <T variant="meta" style={{ color: pressed ? bg : fg }}>
                      {r.sourceName}
                    </T>
                    <T style={{ color: pressed ? bg : fg }} numberOfLines={3}>
                      {r.title}
                    </T>
                  </>
                )}
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={{ marginTop: spacing.xl }}>
          <Rule />
          <T variant="small" style={{ marginTop: spacing.sm }}>
            Headline and link provided for reference. The article and any images belong to {a.sourceName}. This app aggregates
            public news metadata and does not republish full articles.
          </T>
        </View>
      </ScrollView>
    </View>
  );
}
