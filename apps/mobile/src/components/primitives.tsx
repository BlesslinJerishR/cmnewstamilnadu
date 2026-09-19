import { ComponentType, ReactNode } from 'react';
import { Pressable, PressableProps, StyleProp, StyleSheet, Text as RNText, TextProps, View, ViewStyle } from 'react-native';
import type { LucideProps } from './icons';
import { borderWidth, color, icon as iconToken, layout, radius, space, text, TextTone, TextVariant, tone } from '../theme/tokens';

export type IconComponent = ComponentType<LucideProps>;

/** Typography primitive: every piece of text goes through a variant and a tone. */
export function Text({
  variant = 'body',
  tone: t = 'default',
  style,
  maxFontSizeMultiplier = 1.5,
  ...rest
}: TextProps & { variant?: TextVariant; tone?: TextTone }) {
  return <RNText {...rest} maxFontSizeMultiplier={maxFontSizeMultiplier} style={[text[variant], { color: tone[t] }, style]} />;
}

/** Lucide icon with the app's default size, stroke and colour. */
export function Icon({ as: As, size = iconToken.md, strokeWidth = iconToken.stroke, color: c = color.fg }: { as: IconComponent; size?: number; strokeWidth?: number; color?: string }) {
  return <As size={size} strokeWidth={strokeWidth} color={c} absoluteStrokeWidth />;
}

/** Icon-only button with a 44pt touch target regardless of the icon's visual size. */
export function IconButton({ icon, label, onPress, active, style }: { icon: IconComponent; label: string; onPress: () => void; active?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={active === undefined ? undefined : { selected: active }}
      onPress={onPress}
      hitSlop={layout.hitSlop}
      style={({ pressed }) => [styles.iconButton, pressed && { backgroundColor: color.surfacePressed }, style]}
    >
      <Icon as={icon} strokeWidth={active ? iconToken.strokeActive : iconToken.stroke} />
    </Pressable>
  );
}

type ButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  icon?: IconComponent;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  size?: 'md' | 'lg';
};

/** Sharp, intentional buttons: solid black primary, outlined secondary, text-only ghost. */
export function Button({ label, variant = 'primary', icon, iconPosition = 'right', disabled, loading, style, size = 'md', ...rest }: ButtonProps) {
  const fg = variant === 'primary' ? color.inverseFg : color.fg;
  return (
    <Pressable
      {...rest}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled || !!loading, busy: !!loading }}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        size === 'lg' && styles.buttonLg,
        variant === 'primary' && { backgroundColor: color.inverseBg },
        variant === 'secondary' && { borderWidth: borderWidth.hairline, borderColor: color.borderStrong, backgroundColor: color.bg },
        variant === 'ghost' && { paddingHorizontal: 0, minHeight: layout.minTouch },
        (disabled || loading) && { opacity: 0.35 },
        pressed && { opacity: 0.8 },
        style,
      ]}
    >
      {icon && iconPosition === 'left' ? <Icon as={icon} size={iconToken.sm + 2} color={fg} strokeWidth={2} /> : null}
      <Text variant="label" style={{ color: fg }} numberOfLines={1}>
        {loading ? 'Please wait…' : label}
      </Text>
      {icon && iconPosition === 'right' ? <Icon as={icon} size={iconToken.sm + 2} color={fg} strokeWidth={2} /> : null}
    </Pressable>
  );
}

export function Divider({ inset = 0, strong }: { inset?: number; strong?: boolean }) {
  return <View style={{ height: strong ? borderWidth.heavy : StyleSheet.hairlineWidth, backgroundColor: strong ? color.fg : color.border, marginHorizontal: inset }} />;
}

/** Centers content and caps reading width on tablets. */
export function Container({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', paddingHorizontal: layout.gutter }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  iconButton: { width: layout.minTouch, height: layout.minTouch, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  button: {
    minHeight: 48,
    paddingHorizontal: space[5],
    borderRadius: radius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
  },
  buttonLg: { minHeight: 54 },
});
