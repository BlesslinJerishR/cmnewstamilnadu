import { memo, useState } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { color, radius } from '../theme/tokens';
import { Text } from './primitives';

/**
 * Publisher image rendered in monochrome (a saturation blend layer removes colour on iOS and
 * Android), cached in memory and on disk by expo-image and decoded at view size. Missing or
 * broken images fall back to a quiet placeholder carrying the publisher initial.
 */
export const NewsImage = memo(function NewsImage({
  uri,
  aspectRatio,
  size,
  fallbackLabel,
  style,
}: {
  uri: string | null;
  aspectRatio?: number;
  size?: number;
  fallbackLabel: string;
  style?: StyleProp<ViewStyle>;
}) {
  const [failed, setFailed] = useState(false);
  const box: ViewStyle = size ? { width: size, height: size } : { width: '100%', aspectRatio: aspectRatio ?? 16 / 9 };
  const showImage = uri && !failed;
  return (
    <View style={[styles.frame, box, style]} accessible={false} importantForAccessibility="no-hide-descendants">
      {showImage ? (
        <>
          <Image
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={uri}
            transition={180}
            onError={() => setFailed(true)}
          />
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.desaturate]} />
        </>
      ) : (
        <Text variant={size && size < 120 ? 'section' : 'display'} tone="subtle" style={styles.initial}>
          {initials(fallbackLabel)}
        </Text>
      )}
    </View>
  );
});

function initials(label: string): string {
  const words = label.replace(/\.(com|in|org|net|co\.uk|lk)$/i, '').split(/[\s.-]+/).filter((w) => /^[a-z0-9]/i.test(w));
  const pick = words.filter((w) => !/^(the|www)$/i.test(w));
  return (pick.length > 1 ? pick[0][0] + pick[1][0] : (pick[0] ?? '·').slice(0, 2)).toUpperCase();
}

const styles = StyleSheet.create({
  frame: { backgroundColor: color.surface, borderRadius: radius.md, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', isolation: 'isolate' },
  // "saturation" blending with a neutral colour strips hue: the photo shows in black and white.
  desaturate: { backgroundColor: color.fg, mixBlendMode: 'saturation' },
  initial: { letterSpacing: 1 },
});
