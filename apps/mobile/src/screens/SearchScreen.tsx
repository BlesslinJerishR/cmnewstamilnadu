import { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useIsFocused } from '@react-navigation/native';
import { ArrowUpRight, Clock, Search as SearchIcon, SearchX } from 'lucide-react-native';
import { useSearch, useSuggestions } from '../api/queries';
import { ArticleFeed } from '../components/ArticleFeed';
import { AppHeader, OfflineNotice, SearchBar, Segmented } from '../components/chrome';
import { Container, Icon, Text } from '../components/primitives';
import { TabParamList } from '../navigation/types';
import { useSettings } from '../state/settings';
import { color, layout, space } from '../theme/tokens';

type Props = BottomTabScreenProps<TabParamList, 'Search'>;

const SUGGESTED = ['Free electricity', 'Cabinet', 'White paper', 'Women’s safety', 'Madurai'];

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Row used for recent searches, suggestions and example queries. */
function QueryRow({ icon, label, onPress }: { icon: typeof Clock; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Search ${label}`} onPress={onPress} style={({ pressed }) => [styles.queryRow, pressed && { backgroundColor: color.surface }]}>
      <Icon as={icon} size={18} color={color.fgMuted} />
      <Text variant="body" numberOfLines={2} style={{ flex: 1 }}>
        {label}
      </Text>
      <Icon as={ArrowUpRight} size={16} color={color.fgSubtle} />
    </Pressable>
  );
}

/**
 * Search runs entirely on our server (OpenSearch). Results are rendered in the order the API
 * returns them; the app never re-ranks.
 */
export function SearchScreen({ route }: Props) {
  const settings = useSettings();
  const input = useRef<TextInput>(null);
  const focused = useIsFocused();
  const [text, setText] = useState(route.params?.q ?? '');
  const [submitted, setSubmitted] = useState(route.params?.q ?? '');
  const [sort, setSort] = useState<'relevance' | 'latest'>('relevance');
  const debounced = useDebounced(text.trim(), 250);
  const typing = text.trim().length >= 2 && text.trim() !== submitted;
  const suggestions = useSuggestions(typing ? debounced : '');
  const results = useSearch(submitted, sort);

  useEffect(() => {
    if (route.params?.q) {
      setText(route.params.q);
      setSubmitted(route.params.q);
    }
  }, [route.params?.q]);

  useEffect(() => {
    if (focused && route.params?.focus) {
      const t = setTimeout(() => input.current?.focus(), 250);
      return () => clearTimeout(t);
    }
  }, [focused, route.params?.focus]);

  const submit = (q: string) => {
    const t = q.trim();
    setText(t);
    setSubmitted(t);
    if (t.length >= 2) settings.addRecentSearch(t);
    Keyboard.dismiss();
  };

  const first = results.data?.pages[0];
  const hasQuery = submitted.length >= 2;

  return (
    <View style={styles.screen}>
      <AppHeader title="Search" kicker="Every story, one place" />
      <OfflineNotice />
      <Container style={styles.controls}>
        <SearchBar
          ref={input}
          value={text}
          onChangeText={setText}
          onSubmitEditing={() => submit(text)}
          onClear={() => {
            setText('');
            setSubmitted('');
            input.current?.focus();
          }}
          placeholder="Search headlines"
        />
        {hasQuery && !typing ? (
          <View style={styles.resultBar}>
            <Text variant="meta" tone="muted" accessibilityLiveRegion="polite">
              {first ? `${first.total.toLocaleString('en-IN')} result${first.total === 1 ? '' : 's'}` : ' '}
            </Text>
            <Segmented
              options={[
                { key: 'relevance', label: 'Relevant' },
                { key: 'latest', label: 'Newest' },
              ]}
              value={sort}
              onChange={setSort}
            />
          </View>
        ) : null}
        {first?.degraded ? (
          <Text variant="meta" tone="subtle" style={{ marginTop: space[2] }}>
            Simplified results while search is being restored.
          </Text>
        ) : null}
      </Container>

      {typing ? (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list}>
          <QueryRow icon={SearchIcon} label={text.trim()} onPress={() => submit(text)} />
          {(suggestions.data?.suggestions ?? []).map((s) => (
            <QueryRow key={s} icon={ArrowUpRight} label={s} onPress={() => submit(s)} />
          ))}
        </ScrollView>
      ) : hasQuery ? (
        <ArticleFeed query={results} empty={{ title: 'No matches', message: `Nothing found for “${submitted}”. Try fewer or different words.` }} />
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list}>
          {settings.recentSearches.length > 0 ? (
            <>
              <View style={styles.groupHead}>
                <Text variant="overline" tone="subtle">
                  Recent
                </Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Clear recent searches" onPress={settings.clearRecentSearches} hitSlop={12} style={styles.clear}>
                  <Text variant="meta">Clear</Text>
                </Pressable>
              </View>
              {settings.recentSearches.map((q) => (
                <QueryRow key={q} icon={Clock} label={q} onPress={() => submit(q)} />
              ))}
            </>
          ) : null}
          <View style={styles.groupHead}>
            <Text variant="overline" tone="subtle">
              Try
            </Text>
          </View>
          {SUGGESTED.map((q) => (
            <QueryRow key={q} icon={SearchIcon} label={q} onPress={() => submit(q)} />
          ))}
          {settings.recentSearches.length === 0 && !hasQuery ? (
            <View style={styles.hint}>
              <Icon as={SearchX} size={16} color={color.fgSubtle} />
              <Text variant="bodySmall" tone="subtle" style={{ flex: 1 }}>
                Search looks through headlines and descriptions of every story we have collected.
              </Text>
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  controls: { paddingBottom: space[3] },
  resultBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space[3] },
  list: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', paddingHorizontal: layout.gutter, paddingBottom: space[10] },
  queryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    minHeight: 52,
    paddingVertical: space[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border,
  },
  groupHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: space[6], paddingBottom: space[2] },
  clear: { minHeight: 32, justifyContent: 'center' },
  hint: { flexDirection: 'row', gap: space[2], paddingTop: space[6], alignItems: 'flex-start' },
});
