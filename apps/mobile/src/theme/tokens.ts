import { Platform, TextStyle } from 'react-native';

/**
 * Design tokens: the single source of truth for the app's visual system.
 *
 * The palette is deliberately tiny: white dominates, black carries contrast. Secondary tones
 * are black at controlled opacity, never a separate grey or colour.
 */
export const color = {
  bg: '#FFFFFF',
  fg: '#000000',
  inverseBg: '#000000',
  inverseFg: '#FFFFFF',
  /** Secondary text: metadata, descriptions. */
  fgMuted: 'rgba(0,0,0,0.62)',
  /** Tertiary text: timestamps, hints. Still passes WCAG AA for small bold text on white. */
  fgSubtle: 'rgba(0,0,0,0.5)',
  /** Hairline dividers and quiet borders. */
  border: 'rgba(0,0,0,0.1)',
  /** Input and control borders. */
  borderStrong: '#000000',
  /** Faint surfaces: image placeholders, skeletons, pressed rows. */
  surface: 'rgba(0,0,0,0.04)',
  surfacePressed: 'rgba(0,0,0,0.06)',
  inverseMuted: 'rgba(255,255,255,0.72)',
} as const;

/** 4-point spacing scale. Use these, not ad-hoc numbers. */
export const space = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48 } as const;

/** Horizontal page gutter and the maximum reading width on tablets. */
export const layout = { gutter: space[5], maxWidth: 720, thumb: 84, hitSlop: 8, minTouch: 44 } as const;

export const radius = { none: 0, sm: 2, md: 4 } as const;

export const borderWidth = { hairline: 1, strong: 1.5, heavy: 2 } as const;

export const icon = { sm: 16, md: 20, lg: 24, stroke: 1.75, strokeActive: 2.25 } as const;

export const duration = { fast: 120, base: 200, slow: 320, pulse: 900 } as const;

/** Used only where elevation helps (none by default). */
export const shadow = {
  none: {},
} as const;

const family = Platform.select({ ios: 'System', android: 'sans-serif', default: undefined });
const familyMedium = Platform.select({ ios: 'System', android: 'sans-serif-medium', default: undefined });

/**
 * One typeface (the platform system font: SF on iOS, Roboto on Android; both render Tamil)
 * in three weights. Hierarchy comes from size, weight, tracking and line height.
 */
export const text = {
  display: { fontFamily: family, fontSize: 30, lineHeight: 34, fontWeight: '800', letterSpacing: -0.9 },
  title: { fontFamily: family, fontSize: 24, lineHeight: 29, fontWeight: '800', letterSpacing: -0.6 },
  headline: { fontFamily: family, fontSize: 22, lineHeight: 27, fontWeight: '700', letterSpacing: -0.5 },
  section: { fontFamily: family, fontSize: 19, lineHeight: 24, fontWeight: '800', letterSpacing: -0.4 },
  story: { fontFamily: family, fontSize: 16, lineHeight: 21, fontWeight: '700', letterSpacing: -0.2 },
  body: { fontFamily: family, fontSize: 16, lineHeight: 24, fontWeight: '400' },
  bodySmall: { fontFamily: family, fontSize: 14, lineHeight: 20, fontWeight: '400' },
  label: { fontFamily: familyMedium, fontSize: 15, lineHeight: 20, fontWeight: '600' },
  meta: { fontFamily: familyMedium, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  overline: { fontFamily: familyMedium, fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase' },
  tab: { fontFamily: familyMedium, fontSize: 11, lineHeight: 13, fontWeight: '600' },
} satisfies Record<string, TextStyle>;

export type TextVariant = keyof typeof text;
export type TextTone = 'default' | 'muted' | 'subtle' | 'inverse';

export const tone: Record<TextTone, string> = {
  default: color.fg,
  muted: color.fgMuted,
  subtle: color.fgSubtle,
  inverse: color.inverseFg,
};
