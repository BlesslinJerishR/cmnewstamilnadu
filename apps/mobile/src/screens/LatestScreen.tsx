import { View } from 'react-native';
import { useLatest } from '../api/queries';
import { ArticleList } from '../components/ArticleList';
import { OfflineBanner } from '../components/OfflineBanner';
import { useTheme } from '../theme/theme';

export function LatestScreen() {
  const { bg } = useTheme();
  const query = useLatest();
  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <OfflineBanner />
      <ArticleList query={query} emptyTitle="No news yet" emptyMessage="Pull down to refresh." />
    </View>
  );
}
