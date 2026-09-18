import { FlatList, Pressable, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCategories } from '../api/queries';
import { OfflineBanner } from '../components/OfflineBanner';
import { ErrorState, Loading, T } from '../components/ui';
import { RootStackParamList } from '../navigation/types';
import { spacing, useTheme } from '../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Tabs'>;

export function CategoriesScreen({ navigation }: Props) {
  const { fg, bg } = useTheme();
  const q = useCategories();
  if (q.isPending) return <Loading />;
  if (q.isError && !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <OfflineBanner />
      <FlatList
        data={q.data?.items ?? []}
        keyExtractor={(c) => c.slug}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate('Category', { slug: item.slug, name: item.name })}
            style={({ pressed }) => ({ backgroundColor: pressed ? fg : bg, borderBottomWidth: 1, borderBottomColor: fg, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg })}
          >
            {({ pressed }) => (
              <View>
                <T variant="headline" style={{ color: pressed ? bg : fg }}>
                  {item.name} →
                </T>
                {item.description ? (
                  <T variant="small" style={{ color: pressed ? bg : fg, marginTop: 2 }}>
                    {item.description}
                  </T>
                ) : null}
              </View>
            )}
          </Pressable>
        )}
      />
    </View>
  );
}
