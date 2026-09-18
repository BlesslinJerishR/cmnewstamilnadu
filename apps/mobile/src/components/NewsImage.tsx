import { memo, useState } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { color, radius } from '../theme/tokens';

/**
 * Placeholder for stories without a usable photo: the Tamil Nadu government emblem, bundled as
 * a small palette PNG in 1x/2x/3x densities (4–21 KB; the device loads only its own density).
 * The source object is created once, so expo-image decodes it a single time and reuses it from
 * its memory cache for every row.
 */
const PLACEHOLDER = require('../../assets/emblem-placeholder.png');
const PLACEHOLDER_OPACITY = 0.7;

/**
 * Publisher image rendered in monochrome (a saturation blend layer removes colour on iOS and
 * Android), cached in memory and on disk by expo-image and decoded at view size. Missing or
 * broken images fall back to the emblem placeholder.
 */
export const NewsImage = memo(function NewsImage({
  uri,
  aspectRatio,
  size,
  style,
}: {
  uri: string | null;
  aspectRatio?: number;
  size?: number;
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
        <Image source={PLACEHOLDER} style={styles.emblem} contentFit="contain" cachePolicy="memory" transition={0} />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  frame: { backgroundColor: color.surface, borderRadius: radius.md, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', isolation: 'isolate' },
  // "saturation" blending with a neutral colour strips hue: the photo shows in black and white.
  desaturate: { backgroundColor: color.fg, mixBlendMode: 'saturation' },
  // ~62% of the frame's height, never larger than the 120pt the asset is exported for.
  emblem: { height: '62%', aspectRatio: 1, maxHeight: 120, opacity: PLACEHOLDER_OPACITY },
});
