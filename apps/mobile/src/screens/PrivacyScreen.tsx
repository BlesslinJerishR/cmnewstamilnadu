import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/primitives';
import { color, layout, space } from '../theme/tokens';

const SECTIONS: Array<[string, string]> = [
  ['Without an account', 'The app needs no account. Recent searches, saved stories and downloaded news are stored only on this device.'],
  ['With an account', 'If you sign in, we store your email address, a securely hashed password and the list of stories you saved, so they can sync between your devices. Nothing else.'],
  ['Requests', 'Our server keeps standard technical logs (such as IP address and time of request) to protect the service from abuse. We do not sell or share them.'],
  ['Publisher websites', 'When you open an original story you leave the app and the publisher’s own privacy policy applies.'],
  ['Deleting data', 'Clear offline stories from Settings, or sign out and contact the maintainers to delete your account.'],
];

export function PrivacyScreen() {
  return (
    <ScrollView style={{ backgroundColor: color.bg }} contentContainerStyle={styles.content}>
      <View style={styles.inner}>
        <Text variant="display" accessibilityRole="header">
          Privacy
        </Text>
        {SECTIONS.map(([title, body]) => (
          <View key={title} style={styles.block}>
            <Text variant="label">{title}</Text>
            <Text variant="body" tone="muted" style={{ marginTop: space[1] }}>
              {body}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: space[12] },
  inner: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', paddingHorizontal: layout.gutter, paddingTop: space[2] },
  block: { marginTop: space[6], paddingTop: space[4], borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },
});
