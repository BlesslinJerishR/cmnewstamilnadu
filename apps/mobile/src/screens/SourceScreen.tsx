import { useLayoutEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Globe } from '../components/icons';
import { useSourceNews, useSources } from '../api/queries';
import { ArticleFeed } from '../components/ArticleFeed';
import { OfflineNotice } from '../components/chrome';
import { Button, Text } from '../components/primitives';
import { RootStackParamList } from '../navigation/types';
import { color, layout, space } from '../theme/tokens';
import { openExternally } from '../utils/links';

type Props = NativeStackScreenProps<RootStackParamList, 'Source'>;

/** Publisher profile plus that publisher's coverage. */
export function SourceScreen({ route, navigation }: Props) {
  const { domain } = route.params;
  const sources = useSources();
  const info = sources.data?.items.find((s) => s.domain === domain);
  const name = info?.name ?? route.params.name ?? domain;
  const query = useSourceNews(domain);
  useLayoutEffect(() => navigation.setOptions({ title: '' }), [navigation]);

  const header = (
    <View style={styles.header}>
      <Text variant="overline" tone="subtle">
        Publisher
      </Text>
      <Text variant="display" accessibilityRole="header">
        {name}
      </Text>
      <Text variant="bodySmall" tone="muted">
        {[domain, info?.country, info ? `${info.articleCount} ${info.articleCount === 1 ? 'story' : 'stories'}` : null].filter(Boolean).join('  ·  ')}
      </Text>
      <Text variant="bodySmall" tone="muted">
        Every headline links to {name}’s own website. All reporting belongs to the publisher.
      </Text>
      <Button
        label={`Visit ${domain}`}
        variant="secondary"
        icon={Globe}
        iconPosition="left"
        onPress={() => void openExternally(info?.homepageUrl ?? `https://${domain}/`)}
        style={{ alignSelf: 'flex-start', marginTop: space[2] }}
      />
    </View>
  );
  return (
    <View style={styles.screen}>
      <OfflineNotice />
      <ArticleFeed query={query} header={header} empty={{ title: 'No stories', message: 'Nothing from this publisher yet.' }} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  header: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', paddingHorizontal: layout.gutter, paddingTop: space[2], paddingBottom: space[4], gap: space[2] },
});
