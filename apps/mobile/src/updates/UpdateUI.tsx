import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Download, X } from '../components/icons';
import { Button, Icon, Text } from '../components/primitives';
import { borderWidth, color, layout, radius, space } from '../theme/tokens';

/** Clears the bottom tab bar (icon, label and indicator) so banners never cover navigation. */
const TAB_BAR_CLEARANCE = 72;

/** "New version available": a quiet bottom sheet in the app's own components. */
export function UpdatePrompt({ visible, onUpdate, onLater }: { visible: boolean; onUpdate: () => void; onLater: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onLater}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Dismiss" onPress={onLater} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space[4]) + space[2] }]} accessibilityViewIsModal>
          <View style={styles.sheetInner}>
            <Icon as={Download} size={22} />
            <Text variant="title" accessibilityRole="header" style={{ marginTop: space[3] }}>
              New version available
            </Text>
            <Text variant="body" tone="muted" style={{ marginTop: space[2] }}>
              A newer version of the app is ready. Update to get the latest improvements. It downloads in the background while
              you keep reading.
            </Text>
            <Button label="Update now" size="lg" onPress={onUpdate} style={{ marginTop: space[6] }} />
            <Button label="Later" variant="ghost" onPress={onLater} style={{ alignSelf: 'center', marginTop: space[1] }} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Floating status card for a flexible update: download progress, then "Restart now". */
export function UpdateBanner({
  phase,
  percent,
  onRestart,
  onDismiss,
}: {
  phase: 'downloading' | 'downloaded' | 'installing';
  percent: number | null;
  onRestart: () => void;
  onDismiss: () => void;
}) {
  const insets = useSafeAreaInsets();
  const downloading = phase === 'downloading';
  return (
    <View pointerEvents="box-none" style={[styles.bannerWrap, { bottom: insets.bottom + TAB_BAR_CLEARANCE }]}>
      <View style={styles.banner} accessibilityLiveRegion="polite">
        <View style={styles.bannerHead}>
          <View style={{ flex: 1 }}>
            <Text variant="label">{downloading ? 'Updating app' : phase === 'installing' ? 'Installing update' : 'Update ready'}</Text>
            <Text variant="bodySmall" tone="muted" style={{ marginTop: 2 }}>
              {downloading
                ? 'Downloading the latest version. You can keep using the app.'
                : phase === 'installing'
                  ? 'The app will restart in a moment.'
                  : 'The latest version has been downloaded.'}
            </Text>
          </View>
          {phase !== 'installing' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={downloading ? 'Hide download progress' : 'Update later'}
              onPress={onDismiss}
              hitSlop={layout.hitSlop}
              style={styles.close}
            >
              <Icon as={X} size={18} />
            </Pressable>
          ) : null}
        </View>

        {downloading ? (
          <View style={styles.progressRow}>
            <View
              style={styles.track}
              accessibilityRole="progressbar"
              accessibilityValue={percent === null ? undefined : { min: 0, max: 100, now: percent }}
            >
              <View style={[styles.fill, { width: `${percent ?? 0}%` }]} />
            </View>
            <Text variant="meta" tone="muted" style={styles.percent}>
              {percent === null ? '…' : `${percent}%`}
            </Text>
          </View>
        ) : phase === 'downloaded' ? (
          <Button label="Restart now" onPress={onRestart} style={{ marginTop: space[3] }} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Black at reduced opacity: the only "colour" in the app besides black and white.
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: color.bg,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
  sheetInner: { width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: layout.gutter, paddingTop: space[6] },
  bannerWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: space[3] },
  banner: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: color.bg,
    borderWidth: borderWidth.hairline,
    borderColor: color.fg,
    borderRadius: radius.md,
    padding: space[4],
  },
  bannerHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space[2] },
  close: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginTop: -space[1], marginRight: -space[2] },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], marginTop: space[3] },
  track: { flex: 1, height: 3, backgroundColor: color.border, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 3, backgroundColor: color.fg },
  percent: { minWidth: 34, textAlign: 'right' },
});
