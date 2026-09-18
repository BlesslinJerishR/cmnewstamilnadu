import { StyleSheet, View } from 'react-native';
import { Search } from 'lucide-react-native';
import { useLatest } from '../api/queries';
import { ArticleFeed } from '../components/ArticleFeed';
import { AppHeader, OfflineNotice } from '../components/chrome';
import { IconButton } from '../components/primitives';
import { useAppNavigation } from '../navigation/useAppNavigation';
import { color } from '../theme/tokens';

export function LatestScreen() {
  const navigation = useAppNavigation();
  const query = useLatest();
  return (
    <View style={styles.screen}>
      <AppHeader
        title="Latest"
        kicker="All coverage, newest first"
        actions={<IconButton icon={Search} label="Search news" onPress={() => navigation.navigate('Tabs', { screen: 'Search', params: { focus: Date.now() } })} />}
      />
      <OfflineNotice />
      <ArticleFeed query={query} groupByDay empty={{ title: 'No news yet', message: 'Pull down to refresh.' }} />
    </View>
  );
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: color.bg } });
