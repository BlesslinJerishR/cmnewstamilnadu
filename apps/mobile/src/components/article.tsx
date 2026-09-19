import { memo, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { Bookmark, BookmarkCheck, ChevronRight } from './icons';
import type { ArticleSummary } from '@cmnews/shared';
import { useCategoryLabel } from '../api/queries';
import { useBookmarks } from '../state/bookmarks';
import { color, duration, layout, space } from '../theme/tokens';
import { timeAgo } from '../utils/date';
import { NewsImage } from './NewsImage';
import { Icon, Text } from './primitives';

/** "THE HINDU · 3h ago": publisher first, always visible. */
export function MetadataRow({ source, publishedAt, inverse }: { source: string; publishedAt: string; inverse?: boolean }) {
  return (
    <View style={styles.meta}>
      <Text variant="meta" tone={inverse ? 'inverse' : 'default'} numberOfLines={1} style={styles.metaSource}>
        {source}
      </Text>
      <Text variant="meta" tone={inverse ? 'inverse' : 'subtle'}>
        {'  ·  '}
        {timeAgo(publishedAt)}
      </Text>
    </View>
  );
}

function CategoryLabel({ slug }: { slug?: string }) {
  const label = useCategoryLabel(slug);
  // "General" is the fallback bucket; labelling it adds noise, not information.
  if (!label || slug === 'general') return null;
  return (
    <Text variant="overline" tone="muted" numberOfLines={1}>
      {label}
    </Text>
  );
}

/** Lead story: full-width image, category, large headline, publisher and time. No card chrome. */
export const FeaturedArticle = memo(function FeaturedArticle({ article, onPress, showCategory = true }: { article: ArticleSummary; onPress: (a: ArticleSummary) => void; showCategory?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Top story: ${article.title}. ${article.sourceName}, ${timeAgo(article.publishedAt)}`}
      onPress={() => onPress(article)}
      style={({ pressed }) => [styles.featured, pressed && styles.pressed]}
    >
      {/* Without a photo the lead becomes a pure typographic story rather than an empty frame. */}
      {article.imageUrl ? <NewsImage uri={article.imageUrl} aspectRatio={16 / 10} /> : null}
      <View style={[styles.featuredBody, !article.imageUrl && { marginTop: space[2] }]}>
        {showCategory ? <CategoryLabel slug={article.categories[0]} /> : null}
        <Text variant="display" numberOfLines={5} maxFontSizeMultiplier={1.3}>
          {article.title}
        </Text>
        {article.description ? (
          <Text variant="body" tone="muted" numberOfLines={3}>
            {article.description}
          </Text>
        ) : null}
        <MetadataRow source={article.sourceName} publishedAt={article.publishedAt} />
      </View>
    </Pressable>
  );
});

/** Scannable list row: text first, square thumbnail on the right, hairline divider below. */
export const CompactArticle = memo(function CompactArticle({
  article,
  onPress,
  showCategory = true,
  trailing,
}: {
  article: ArticleSummary;
  onPress: (a: ArticleSummary) => void;
  showCategory?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${article.title}. ${article.sourceName}, ${timeAgo(article.publishedAt)}`}
      onPress={() => onPress(article)}
      style={({ pressed }) => [styles.compact, pressed && styles.pressed]}
    >
      <View style={styles.compactText}>
        {showCategory ? <CategoryLabel slug={article.categories[0]} /> : null}
        <Text variant="story" numberOfLines={4}>
          {article.title}
        </Text>
        <MetadataRow source={article.sourceName} publishedAt={article.publishedAt} />
      </View>
      <View style={styles.compactSide}>
        <NewsImage uri={article.imageUrl} size={layout.thumb} />
        {trailing}
      </View>
    </Pressable>
  );
});

/** Save toggle with a short scale response. Filled glyph + label state for screen readers. */
export function BookmarkButton({ article, withLabel }: { article: ArticleSummary; withLabel?: boolean }) {
  const { isSaved, toggle } = useBookmarks();
  const saved = isSaved(article.id);
  const scale = useRef(new Animated.Value(1)).current;
  const press = () => {
    toggle(article);
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.82, duration: duration.fast, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 5, tension: 180, useNativeDriver: true }),
    ]).start();
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={saved ? 'Remove from saved' : 'Save story'}
      accessibilityState={{ selected: saved }}
      onPress={press}
      hitSlop={layout.hitSlop}
      style={({ pressed }) => [styles.bookmark, withLabel && styles.bookmarkLabeled, pressed && styles.pressed]}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Icon as={saved ? BookmarkCheck : Bookmark} strokeWidth={saved ? 2.25 : 1.75} />
      </Animated.View>
      {withLabel ? <Text variant="label">{saved ? 'Saved' : 'Save'}</Text> : null}
    </Pressable>
  );
}

/** Section title with an optional "See all" link. */
export function SectionHeader({ title, onSeeAll, subtitle }: { title: string; onSeeAll?: () => void; subtitle?: string }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionRule} />
      <View style={styles.sectionRow}>
        <View style={{ flex: 1 }}>
          <Text variant="section" accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? (
            <Text variant="bodySmall" tone="muted" style={{ marginTop: 2 }}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {onSeeAll ? (
          <Pressable accessibilityRole="link" accessibilityLabel={`See all ${title}`} onPress={onSeeAll} hitSlop={12} style={styles.seeAll}>
            <Text variant="meta">See all</Text>
            <Icon as={ChevronRight} size={16} strokeWidth={2} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.6 },
  meta: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  metaSource: { flexShrink: 1, textTransform: 'uppercase', letterSpacing: 0.4 },
  featured: { paddingTop: space[2], paddingBottom: space[6] },
  featuredBody: { marginTop: space[4], gap: space[2] + 2 },
  compact: {
    flexDirection: 'row',
    paddingVertical: space[4],
    gap: space[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border,
  },
  compactText: { flex: 1, gap: space[1] + 2 },
  compactSide: { alignItems: 'center', gap: space[1] },
  bookmark: { minWidth: layout.minTouch, minHeight: layout.minTouch, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: space[2] },
  bookmarkLabeled: { paddingHorizontal: space[2] },
  section: { paddingTop: space[8], paddingBottom: space[1] },
  sectionRule: { height: 2, backgroundColor: color.fg, width: 24, marginBottom: space[3] },
  sectionRow: { flexDirection: 'row', alignItems: 'center' },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: layout.minTouch, paddingLeft: space[3] },
});
