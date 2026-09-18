import { FlatList, Pressable, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSources } from '../api/queries';
import { ErrorState, Loading, T } from '../components/ui';
import { RootStackParamList } from '../navigation/types';
import { spacing, useTheme } from '../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Sources'>;

export function SourcesScreen({ navigation }: Props) {
  const { fg, bg } = useTheme();
  const q = useSources();
  if (q.isPending) return <Loading />;
  if (q.isError && !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  return (
    <FlatList
      style={{ backgroundColor: bg }}
      data={q.data?.items ?? []}
      keyExtractor={(s) => s.domain}
      ListHeaderComponent={
        <T variant="small" style={{ padding: spacing.lg }}>
          Publishers whose reporting appears in this app. Tap one to see its coverage.
        </T>
      }
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate('Source', { domain: item.domain, name: item.name })}
          style={({ pressed }) => ({ backgroundColor: pressed ? fg : bg, borderBottomWidth: 1, borderBottomColor: fg, padding: spacing.lg, flexDirection: 'row', justifyContent: 'space-between' })}
        >
          {({ pressed }) => (
            <>
              <View style={{ flex: 1 }}>
                <T variant="headline" style={{ color: pressed ? bg : fg }}>
                  {item.name}
                </T>
                <T variant="small" style={{ color: pressed ? bg : fg }}>
                  {item.domain}
                </T>
              </View>
              <T variant="meta" style={{ color: pressed ? bg : fg, alignSelf: 'center' }}>
                {item.articleCount}
              </T>
            </>
          )}
        </Pressable>
      )}
    />
  );
}
