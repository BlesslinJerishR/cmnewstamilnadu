import { useLayoutEffect } from 'react';
import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSourceNews, useSources } from '../api/queries';
import { ArticleList } from '../components/ArticleList';
import { OfflineBanner } from '../components/OfflineBanner';
import { Button, Rule, T } from '../components/ui';
import { RootStackParamList } from '../navigation/types';
import { spacing, useTheme } from '../theme/theme';
import { openExternally } from '../utils/links';

type Props = NativeStackScreenProps<RootStackParamList, 'Source'>;

/** Publisher information plus that publisher's coverage in the app. */
export function SourceScreen({ route, navigation }: Props) {
  const { bg } = useTheme();
  const { domain } = route.params;
  const sources = useSources();
  const info = sources.data?.items.find((s) => s.domain === domain);
  const name = info?.name ?? route.params.name ?? domain;
  const query = useSourceNews(domain);
  useLayoutEffect(() => navigation.setOptions({ title: name }), [navigation, name]);

  const header = (
    <View style={{ padding: spacing.lg }}>
      <T variant="display">{name}</T>
      <T style={{ marginTop: spacing.xs }}>{domain}</T>
      {info?.country ? <T variant="small">Country: {info.country}</T> : null}
      {info ? <T variant="small">{info.articleCount} article{info.articleCount === 1 ? '' : 's'} in this app</T> : null}
      <T variant="small" style={{ marginTop: spacing.sm }}>
        Headlines link to the publisher's own website. All articles belong to {name}.
      </T>
      <Button label={`Visit ${domain}`} variant="outline" onPress={() => void openExternally(info?.homepageUrl ?? `https://${domain}/`)} style={{ marginTop: spacing.md }} />
      <View style={{ marginTop: spacing.lg }}>
        <Rule thick />
      </View>
    </View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <OfflineBanner />
      <ArticleList query={query} header={header} emptyTitle="No articles" />
    </View>
  );
}
