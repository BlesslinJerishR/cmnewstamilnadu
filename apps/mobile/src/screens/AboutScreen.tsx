import { ScrollView, View } from 'react-native';
import { Button, Rule, T } from '../components/ui';
import { spacing, useTheme } from '../theme/theme';
import { openExternally } from '../utils/links';

function P({ children }: { children: string }) {
  return <T style={{ marginBottom: spacing.md }}>{children}</T>;
}

export function AboutScreen() {
  const { bg } = useTheme();
  return (
    <ScrollView style={{ backgroundColor: bg }} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl * 2 }}>
      <T variant="display" style={{ marginBottom: spacing.md }}>
        CM News Tamil Nadu
      </T>
      <P>
        An open source app that collects English-language news coverage about the Chief Minister of Tamil Nadu, C. Joseph Vijay,
        and his government.
      </P>
      <P>
        How it works: our server discovers coverage through the public GDELT Project, keeps only relevant articles using
        transparent keyword rules, removes duplicates and syndicated copies, and sorts stories into categories. No artificial
        intelligence is used anywhere.
      </P>
      <P>
        We store and show only headlines, publisher names, dates and links. Every full story is read on the publisher's own
        website, and all articles and images remain the property of their publishers.
      </P>
      <P>
        Coverage is collected automatically, so an unrelated story can occasionally slip through. The app does not endorse any
        publisher or viewpoint.
      </P>
      <Rule />
      <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
        <Button label="Source code (Apache-2.0)" variant="outline" onPress={() => void openExternally('https://github.com/BlesslinJerishR/CmNewsTamilnadu')} />
        <Button label="The GDELT Project" variant="outline" onPress={() => void openExternally('https://www.gdeltproject.org/')} />
      </View>
    </ScrollView>
  );
}
