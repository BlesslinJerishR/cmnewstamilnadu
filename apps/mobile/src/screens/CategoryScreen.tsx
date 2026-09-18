import { useLayoutEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCategories, useCategoryNews } from '../api/queries';
import { ArticleFeed } from '../components/ArticleFeed';
import { OfflineNotice } from '../components/chrome';
import { Text } from '../components/primitives';
import { RootStackParamList } from '../navigation/types';
import { color, layout, space } from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'Category'>;

export function CategoryScreen({ route, navigation }: Props) {
  const { slug } = route.params;
  const categories = useCategories();
  const info = categories.data?.items.find((c) => c.slug === slug);
  const name = info?.name ?? route.params.name ?? slug.replace(/-/g, ' ');
  const query = useCategoryNews(slug);
  // Title lives in the page itself; the bar stays empty until it scrolls away (quiet header).
  useLayoutEffect(() => navigation.setOptions({ title: '' }), [navigation]);

  const header = (
    <View style={styles.header}>
      <Text variant="overline" tone="subtle">
        Topic
      </Text>
      <Text variant="display" accessibilityRole="header">
        {name}
      </Text>
      {info?.description ? (
        <Text variant="body" tone="muted">
          {info.description}
        </Text>
      ) : null}
    </View>
  );
  return (
    <View style={styles.screen}>
      <OfflineNotice />
      <ArticleFeed query={query} header={header} featureFirst hideCategory empty={{ title: 'Nothing here yet', message: 'No stories in this topic so far.' }} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  header: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', paddingHorizontal: layout.gutter, paddingTop: space[2], paddingBottom: space[5], gap: space[2] },
});
