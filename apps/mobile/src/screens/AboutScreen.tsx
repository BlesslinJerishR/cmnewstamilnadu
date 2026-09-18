import { ScrollView, StyleSheet, View } from 'react-native';
import { ExternalLink } from 'lucide-react-native';
import { Button, Divider, Text } from '../components/primitives';
import { color, layout, space } from '../theme/tokens';
import { openExternally } from '../utils/links';

function Block({ title, children }: { title: string; children: string }) {
  return (
    <View style={styles.block}>
      <Text variant="overline" tone="subtle">
        {title}
      </Text>
      <Text variant="body" style={{ marginTop: space[2] }}>
        {children}
      </Text>
    </View>
  );
}

export function AboutScreen() {
  return (
    <ScrollView style={{ backgroundColor: color.bg }} contentContainerStyle={styles.content}>
      <View style={styles.inner}>
        <Text variant="display" accessibilityRole="header">
          CM News TN
        </Text>
        <Text variant="body" tone="muted" style={{ marginTop: space[3] }}>
          Focused, open source coverage of Tamil Nadu Chief Minister C. Joseph Vijay and his government.
        </Text>
        <Divider />
        <Block title="How it works">
          Our server discovers English news through the public GDELT Project, keeps only relevant stories using transparent
          keyword rules, removes duplicates and syndicated copies, and sorts stories into topics. No artificial intelligence is
          used anywhere.
        </Block>
        <Block title="Publishers first">
          We show headlines, publisher names, times and links. Every full story is read on the publisher’s own website, and all
          articles and images remain the property of their publishers.
        </Block>
        <Block title="Independence">
          Coverage is collected automatically, so an unrelated story can occasionally slip through. The app does not endorse any
          publisher or viewpoint.
        </Block>
        <View style={{ gap: space[3], marginTop: space[8] }}>
          <Button label="Source code · Apache-2.0" variant="secondary" icon={ExternalLink} onPress={() => void openExternally('https://github.com/BlesslinJerishR/CmNewsTamilnadu')} />
          <Button label="The GDELT Project" variant="secondary" icon={ExternalLink} onPress={() => void openExternally('https://www.gdeltproject.org/')} />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: space[12] },
  inner: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', paddingHorizontal: layout.gutter, paddingTop: space[2], gap: space[4] },
  block: { marginTop: space[4] },
});
