import { useEffect, useState } from 'react';
import { Keyboard, Pressable, ScrollView, TextInput, View } from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useSearch, useSuggestions } from '../api/queries';
import { ArticleList } from '../components/ArticleList';
import { OfflineBanner } from '../components/OfflineBanner';
import { Chip, T } from '../components/ui';
import { TabParamList } from '../navigation/types';
import { useSettings } from '../state/settings';
import { spacing, useTheme } from '../theme/theme';

type Props = BottomTabScreenProps<TabParamList, 'Search'>;

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Search runs on our server (OpenSearch); the app never queries any news provider. */
export function SearchScreen({ route }: Props) {
  const { fg, bg } = useTheme();
  const settings = useSettings();
  const [text, setText] = useState(route.params?.q ?? '');
  const [submitted, setSubmitted] = useState(route.params?.q ?? '');
  const [sort, setSort] = useState<'relevance' | 'latest'>('relevance');
  const debounced = useDebounced(text, 300);
  const suggestions = useSuggestions(debounced !== submitted ? debounced : '');
  const results = useSearch(submitted, sort);

  useEffect(() => {
    if (route.params?.q) {
      setText(route.params.q);
      setSubmitted(route.params.q);
    }
  }, [route.params?.q]);

  const submit = (q: string) => {
    const t = q.trim();
    setText(t);
    setSubmitted(t);
    if (t.length >= 2) settings.addRecentSearch(t);
    Keyboard.dismiss();
  };

  const degraded = results.data?.pages[0]?.degraded;
  const total = results.data?.pages[0]?.total;
  const showSuggestions = text.trim().length >= 2 && text !== submitted && (suggestions.data?.suggestions.length ?? 0) > 0;

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <OfflineBanner />
      <View style={{ padding: spacing.lg, paddingBottom: spacing.sm }}>
        <T variant="meta" style={{ marginBottom: spacing.xs }}>
          Search headlines
        </T>
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={() => submit(text)}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
          accessibilityLabel="Search news"
          selectionColor={fg}
          cursorColor={fg}
          style={{ borderWidth: 2, borderColor: fg, color: fg, backgroundColor: bg, fontSize: 17, paddingHorizontal: spacing.md, paddingVertical: 10 }}
        />
        <View style={{ flexDirection: 'row', marginTop: spacing.sm }}>
          <Chip label="Most relevant" selected={sort === 'relevance'} onPress={() => setSort('relevance')} />
          <Chip label="Newest" selected={sort === 'latest'} onPress={() => setSort('latest')} />
        </View>
      </View>

      {showSuggestions ? (
        <ScrollView keyboardShouldPersistTaps="handled" style={{ borderTopWidth: 1, borderTopColor: fg }}>
          {suggestions.data!.suggestions.map((s) => (
            <Pressable key={s} onPress={() => submit(s)} style={({ pressed }) => ({ padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: fg, backgroundColor: pressed ? fg : bg })}>
              {({ pressed }) => (
                <T style={{ color: pressed ? bg : fg }} numberOfLines={2}>
                  {s}
                </T>
              )}
            </Pressable>
          ))}
        </ScrollView>
      ) : submitted.trim().length >= 2 ? (
        <ArticleList
          query={results}
          header={
            results.data ? (
              <T variant="small" style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
                {total ?? 0} result{total === 1 ? '' : 's'}
                {degraded ? ' · limited search while the search service recovers' : ''}
              </T>
            ) : null
          }
          emptyTitle="No matches"
          emptyMessage="Try different or fewer words."
        />
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.lg }}>
          {settings.recentSearches.length > 0 ? (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm }}>
                <T variant="meta">Recent searches</T>
                <Pressable onPress={settings.clearRecentSearches} hitSlop={10} accessibilityRole="button">
                  <T variant="meta">Clear</T>
                </Pressable>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {settings.recentSearches.map((q) => (
                  <Chip key={q} label={q} onPress={() => submit(q)} />
                ))}
              </View>
            </>
          ) : (
            <>
              <T>Search across all collected coverage of the Chief Minister and the Tamil Nadu government.</T>
              <T variant="small" style={{ marginTop: spacing.sm }}>
                Try: free electricity, cabinet, white paper, Madurai
              </T>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}
