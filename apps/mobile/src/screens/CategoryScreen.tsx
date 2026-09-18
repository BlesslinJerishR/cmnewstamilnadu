import { useLayoutEffect } from 'react';
import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCategoryNews } from '../api/queries';
import { ArticleList } from '../components/ArticleList';
import { OfflineBanner } from '../components/OfflineBanner';
import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Category'>;

export function CategoryScreen({ route, navigation }: Props) {
  const { bg } = useTheme();
  const { slug, name } = route.params;
  const query = useCategoryNews(slug);
  useLayoutEffect(() => navigation.setOptions({ title: name ?? slug.replace(/-/g, ' ') }), [navigation, name, slug]);
  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <OfflineBanner />
      <ArticleList query={query} emptyTitle="Nothing here yet" emptyMessage="No articles in this category so far." />
    </View>
  );
}
