import { useCallback, useLayoutEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ArrowUpRight, ChevronRight, ExternalLink, Share2 } from 'lucide-react-native';
import type { ArticleSummary } from '@cmnews/shared';
import { useArticle, useCategoryLabel, useRelated } from '../api/queries';
import { BookmarkButton, CompactArticle, SectionHeader } from '../components/article';
import { ArticleSkeleton, ErrorState, OfflineNotice } from '../components/chrome';
import { NewsImage } from '../components/NewsImage';
import { Button, Container, Divider, Icon, IconButton, Text } from '../components/primitives';
import { RootStackParamList } from '../navigation/types';
import { color, layout, space } from '../theme/tokens';
import { formatIst, timeAgo } from '../utils/date';
import { openArticle, shareArticle } from '../utils/links';

type Props = NativeStackScreenProps<RootStackParamList, 'Article'>;

/**
 * Story page: who published it, when, what it is, and where to read it. We show the
 * headline, description and a monochrome preview image only; the full story stays with the
 * publisher.
 */
export function ArticleScreen({ route, navigation }: Props) {
  const { id, summary } = route.params;
  const q = useArticle(id, summary);
  const a = q.data;
  const category = a?.categories[0];
  const categoryLabel = useCategoryLabel(category);
  const related = useRelated(category, id);
  const openRelated = useCallback((r: ArticleSummary) => navigation.push('Article', { id: r.id, summary: r }), [navigation]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: '',
      headerRight: () =>
        a ? (
          <View style={styles.headerActions}>
            <BookmarkButton article={a} />
            <IconButton icon={Share2} label="Share story" onPress={() => void shareArticle(a.title, a.url, a.sourceName)} />
          </View>
        ) : null,
    });
  }, [navigation, a]);

  if (!a && q.isPending) return <ArticleSkeleton />;
  if (!a) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;

  return (
    <View style={styles.screen}>
      <OfflineNotice />
      <ScrollView contentContainerStyle={styles.content}>
        <Container>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Publisher: ${a.sourceName}. View all stories from this publisher`}
            onPress={() => navigation.navigate('Source', { domain: a.sourceDomain, name: a.sourceName })}
            style={styles.source}
            hitSlop={8}
          >
            <Text variant="meta" style={styles.sourceName}>
              {a.sourceName}
            </Text>
            <Icon as={ChevronRight} size={14} strokeWidth={2} />
          </Pressable>

          <View style={styles.kicker}>
            {categoryLabel ? (
              <Pressable accessibilityRole="link" onPress={() => category && navigation.navigate('Category', { slug: category, name: categoryLabel })} hitSlop={8}>
                <Text variant="overline">{categoryLabel}</Text>
              </Pressable>
            ) : null}
            <Text variant="overline" tone="subtle">
              {categoryLabel ? '·  ' : ''}
              {timeAgo(a.publishedAt)}
            </Text>
          </View>

          <Text variant="display" style={styles.headline} accessibilityRole="header" maxFontSizeMultiplier={1.3}>
            {a.title}
          </Text>

          {a.description ? (
            <Text variant="body" tone="muted" style={styles.description}>
              {a.description}
            </Text>
          ) : null}

          <NewsImage uri={a.imageUrl} aspectRatio={16 / 10} style={{ marginTop: space[6] }} />

          <View style={styles.facts}>
            <Fact label="Published" value={formatIst(a.publishedAt)} />
            <Fact label="Publisher" value={`${a.sourceName}${a.sourceCountry ? ` · ${a.sourceCountry}` : ''}`} />
            {a.author ? <Fact label="Author" value={a.author} /> : null}
          </View>

          <Button
            size="lg"
            label="Read original"
            icon={ExternalLink}
            onPress={() => void openArticle(a.url)}
            accessibilityHint={`Opens the full story on ${a.sourceName}'s website`}
          />
          <Text variant="meta" tone="subtle" style={styles.ctaNote}>
            Full story on {a.sourceDomain}
          </Text>

          {a.alsoReportedBy.length > 0 ? (
            <View>
              <SectionHeader title="Also reported by" subtitle={`${a.alsoReportedBy.length} more publisher${a.alsoReportedBy.length === 1 ? '' : 's'} covered this story`} />
              {a.alsoReportedBy.map((r) => (
                <Pressable
                  key={r.id}
                  accessibilityRole="link"
                  accessibilityLabel={`${r.sourceName}: ${r.title}. Opens the publisher's website`}
                  onPress={() => void openArticle(r.url)}
                  style={({ pressed }) => [styles.coverage, pressed && { opacity: 0.6 }]}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="meta" style={styles.sourceName}>
                      {r.sourceName}
                    </Text>
                    <Text variant="bodySmall" numberOfLines={2}>
                      {r.title}
                    </Text>
                  </View>
                  <Icon as={ArrowUpRight} size={18} />
                </Pressable>
              ))}
            </View>
          ) : null}

          {related.data && related.data.length > 0 ? (
            <View>
              <SectionHeader
                title={`More in ${categoryLabel ?? 'this topic'}`}
                onSeeAll={category ? () => navigation.navigate('Category', { slug: category, name: categoryLabel ?? undefined }) : undefined}
              />
              {related.data.map((r) => (
                <CompactArticle key={r.id} article={r} onPress={openRelated} showCategory={false} />
              ))}
            </View>
          ) : null}

          <View style={styles.attribution}>
            <Divider />
            <Text variant="bodySmall" tone="subtle" style={{ marginTop: space[4] }}>
              Headline, description and image preview are shown for reference. The article belongs to {a.sourceName}; we do not
              republish full stories.
            </Text>
          </View>
        </Container>
      </ScrollView>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text variant="meta" tone="subtle" style={{ width: 88 }}>
        {label}
      </Text>
      <Text variant="bodySmall" style={{ flex: 1 }}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  content: { paddingTop: space[2], paddingBottom: space[12] },
  headerActions: { flexDirection: 'row', alignItems: 'center', marginRight: -space[2] },
  source: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', minHeight: 32 },
  sourceName: { textTransform: 'uppercase', letterSpacing: 0.5 },
  kicker: { flexDirection: 'row', alignItems: 'center', gap: space[2], marginTop: space[3] },
  headline: { marginTop: space[3] },
  description: { marginTop: space[4], fontSize: 17, lineHeight: 26 },
  facts: { marginTop: space[5], marginBottom: space[6], borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },
  fact: { flexDirection: 'row', paddingVertical: space[3], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.border, gap: space[3] },
  ctaNote: { textAlign: 'center', marginTop: space[2] },
  coverage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingVertical: space[4],
    minHeight: layout.minTouch,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border,
  },
  attribution: { marginTop: space[10] },
});
