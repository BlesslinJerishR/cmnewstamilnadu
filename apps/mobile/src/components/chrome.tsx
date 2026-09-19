import { forwardRef, ReactNode, useEffect, useRef, useSyncExternalStore } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, TextInput, TextInputProps, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CircleAlert, Search, WifiOff, X } from './icons';
import { onlineManager } from '@tanstack/react-query';
import { borderWidth, color, duration, layout, radius, space, text } from '../theme/tokens';
import { Button, Container, Icon, IconComponent, Text } from './primitives';

/**
 * Lightweight top header used by tab screens: large title (or brand) with a quiet kicker line
 * and up to two icon actions. Sits below the status bar / notch via safe-area insets.
 */
export function AppHeader({ title, kicker, actions, brand }: { title: string; kicker?: string; actions?: ReactNode; brand?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + space[2], backgroundColor: color.bg }}>
      <Container style={styles.header}>
        <View style={{ flex: 1 }}>
          {kicker ? (
            <Text variant="overline" tone="subtle" numberOfLines={1}>
              {kicker}
            </Text>
          ) : null}
          <Text variant={brand ? 'title' : 'display'} accessibilityRole="header" numberOfLines={1}>
            {title}
          </Text>
        </View>
        {actions ? <View style={styles.headerActions}>{actions}</View> : null}
      </Container>
    </View>
  );
}

/**
 * Horizontal monochrome category navigation. Selected: black fill, white text.
 * Unselected: white with a hairline border.
 */
export function CategorySelector({ items, selected, onSelect }: { items: Array<{ key: string; label: string }>; selected: string; onSelect: (key: string) => void }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.selector}
      accessibilityRole="tablist"
    >
      {items.map((item) => {
        const active = item.key === selected;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(item.key)}
            style={({ pressed }) => [styles.chip, active ? styles.chipActive : styles.chipIdle, pressed && !active && { backgroundColor: color.surfacePressed }]}
          >
            <Text variant="meta" tone={active ? 'inverse' : 'default'} style={{ fontSize: 13 }}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Search field: black border, search glyph, clear action. */
export const SearchBar = forwardRef<TextInput, TextInputProps & { onClear: () => void }>(function SearchBar({ value, onClear, ...rest }, ref) {
  return (
    <View style={styles.search}>
      <Icon as={Search} size={20} strokeWidth={2} />
      <TextInput
        ref={ref}
        value={value}
        {...rest}
        style={styles.searchInput}
        placeholderTextColor={color.fgSubtle}
        selectionColor={color.fg}
        cursorColor={color.fg}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        accessibilityLabel="Search news"
      />
      {value ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={onClear} hitSlop={10} style={styles.searchClear}>
          <Icon as={X} size={18} strokeWidth={2} />
        </Pressable>
      ) : null}
    </View>
  );
});

/** Two-option segmented control (e.g. Most relevant / Newest). */
export function Segmented<K extends string>({ options, value, onChange }: { options: Array<{ key: K; label: string }>; value: K; onChange: (k: K) => void }) {
  return (
    <View style={styles.segmented} accessibilityRole="radiogroup">
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            onPress={() => onChange(o.key)}
            style={[styles.segment, active && { backgroundColor: color.inverseBg }]}
          >
            <Text variant="meta" tone={active ? 'inverse' : 'default'}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Calm pulse used by all skeletons (native driver, no colour, no shimmer). */
function usePulse() {
  const v = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: duration.pulse, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.55, duration: duration.pulse, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return v;
}

function Bone({ w, h, style }: { w: number | `${number}%`; h: number; style?: object }) {
  return <View style={[{ width: w, height: h, backgroundColor: color.surface, borderRadius: radius.sm }, style]} />;
}

export function FeedSkeleton({ featured = true, rows = 5 }: { featured?: boolean; rows?: number }) {
  const opacity = usePulse();
  return (
    <Animated.View style={{ opacity }} accessibilityLabel="Loading news" accessibilityRole="progressbar">
      <Container>
        {featured ? (
          <View style={{ paddingTop: space[2], paddingBottom: space[6], gap: space[3] }}>
            <Bone w="100%" h={0} style={{ aspectRatio: 16 / 10, height: undefined }} />
            <Bone w={80} h={10} style={{ marginTop: space[2] }} />
            <Bone w="95%" h={26} />
            <Bone w="70%" h={26} />
            <Bone w={140} h={10} />
          </View>
        ) : null}
        {Array.from({ length: rows }, (_, i) => (
          <View key={i} style={styles.skeletonRow}>
            <View style={{ flex: 1, gap: space[2] }}>
              <Bone w={70} h={9} />
              <Bone w="96%" h={15} />
              <Bone w="72%" h={15} />
              <Bone w={120} h={9} style={{ marginTop: 2 }} />
            </View>
            <Bone w={layout.thumb} h={layout.thumb} style={{ borderRadius: radius.md }} />
          </View>
        ))}
      </Container>
    </Animated.View>
  );
}

export function ArticleSkeleton() {
  const opacity = usePulse();
  return (
    <Animated.View style={{ opacity, paddingTop: space[4] }} accessibilityLabel="Loading story" accessibilityRole="progressbar">
      <Container style={{ gap: space[3] }}>
        <Bone w={120} h={10} />
        <Bone w="100%" h={30} />
        <Bone w="85%" h={30} />
        <Bone w="60%" h={30} />
        <Bone w={160} h={10} style={{ marginTop: space[2] }} />
        <Bone w="100%" h={0} style={{ aspectRatio: 16 / 10, height: undefined, marginTop: space[4] }} />
      </Container>
    </Animated.View>
  );
}

/** Empty / informational state: minimal icon, large line, short explanation, optional action. */
export function EmptyState({ icon, title, message, action }: { icon: IconComponent; title: string; message?: string; action?: { label: string; onPress: () => void } }) {
  return (
    <Container style={styles.state}>
      <View style={styles.stateIcon}>
        <Icon as={icon} size={22} strokeWidth={1.75} />
      </View>
      <Text variant="title" style={{ textAlign: 'center' }} accessibilityRole="header">
        {title}
      </Text>
      {message ? (
        <Text variant="body" tone="muted" style={{ textAlign: 'center', maxWidth: 320 }}>
          {message}
        </Text>
      ) : null}
      {action ? <Button label={action.label} variant="secondary" onPress={action.onPress} style={{ marginTop: space[3], minWidth: 160 }} /> : null}
    </Container>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const offline = (error as { code?: string })?.code === 'network';
  return (
    <EmptyState
      icon={offline ? WifiOff : CircleAlert}
      title={offline ? 'You’re offline' : 'Unable to load news'}
      message={offline ? 'Check your connection and try again. Stories you have opened before stay available.' : 'Something went wrong on our side. Please try again in a moment.'}
      action={onRetry ? { label: 'Retry', onPress: onRetry } : undefined}
    />
  );
}

/**
 * Connectivity from TanStack Query's onlineManager, which App.tsx feeds from a single NetInfo
 * subscription; every screen shares it instead of opening its own listener.
 */
export function useIsOnline(): boolean {
  return useSyncExternalStore(
    (cb) => onlineManager.subscribe(cb),
    () => onlineManager.isOnline(),
    () => true,
  );
}

/** Quiet one-line notice while offline; cached stories stay fully usable underneath. */
export function OfflineNotice() {
  const online = useIsOnline();
  if (online) return null;
  return (
    <View style={styles.offline} accessibilityLiveRegion="polite" accessibilityLabel="Offline. Showing saved stories.">
      <Icon as={WifiOff} size={14} strokeWidth={2} />
      <Text variant="meta">Offline · showing saved stories</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-end', paddingBottom: space[3], gap: space[2] },
  headerActions: { flexDirection: 'row', alignItems: 'center', marginRight: -space[3], marginBottom: -space[2] },
  selector: { paddingHorizontal: layout.gutter, gap: space[2], paddingVertical: space[2] },
  chip: { height: 34, paddingHorizontal: space[4], borderRadius: radius.sm, justifyContent: 'center', borderWidth: borderWidth.hairline },
  chipActive: { backgroundColor: color.inverseBg, borderColor: color.inverseBg },
  chipIdle: { backgroundColor: color.bg, borderColor: color.border },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: borderWidth.strong,
    borderColor: color.borderStrong,
    borderRadius: radius.md,
    paddingLeft: space[4],
    minHeight: 52,
    gap: space[3],
    backgroundColor: color.bg,
  },
  searchInput: { flex: 1, ...text.body, fontSize: 17, color: color.fg, paddingVertical: space[3], paddingRight: space[2] },
  searchClear: { width: layout.minTouch, height: layout.minTouch, alignItems: 'center', justifyContent: 'center' },
  segmented: { flexDirection: 'row', borderWidth: borderWidth.hairline, borderColor: color.fg, borderRadius: radius.sm, padding: 2, alignSelf: 'flex-start' },
  segment: { minHeight: 32, paddingHorizontal: space[4], justifyContent: 'center', borderRadius: radius.sm - 1 },
  skeletonRow: { flexDirection: 'row', gap: space[4], paddingVertical: space[4], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.border },
  state: { alignItems: 'center', justifyContent: 'center', paddingVertical: space[12], gap: space[3], flexGrow: 1 },
  stateIcon: { width: 52, height: 52, borderRadius: 26, borderWidth: borderWidth.hairline, borderColor: color.border, alignItems: 'center', justifyContent: 'center', marginBottom: space[2] },
  offline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[2], paddingVertical: space[2], backgroundColor: color.surface },
});
