import { Pressable, StyleSheet, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bookmark, House, LayoutGrid, Newspaper, Search } from 'lucide-react-native';
import { Icon, IconComponent, Text } from '../components/primitives';
import { color, icon, layout, space } from '../theme/tokens';
import { TabParamList } from './types';

const TABS: Record<keyof TabParamList, { icon: IconComponent; label: string }> = {
  Home: { icon: House, label: 'Home' },
  Latest: { icon: Newspaper, label: 'Latest' },
  Categories: { icon: LayoutGrid, label: 'Topics' },
  Search: { icon: Search, label: 'Search' },
  Saved: { icon: Bookmark, label: 'Saved' },
};

/**
 * Minimal tab bar: white surface, hairline top border. The selected tab is marked without
 * colour: a short black bar above it, a heavier icon stroke and full-strength label; inactive
 * tabs sit at reduced opacity.
 */
export function BottomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space[2]) }]} accessibilityRole="tablist">
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const meta = TABS[route.name as keyof TabParamList];
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        };
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={meta.label}
            onPress={onPress}
            onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
            style={styles.tab}
          >
            <View style={[styles.indicator, focused && { backgroundColor: color.fg }]} />
            <View style={{ opacity: focused ? 1 : 0.45, alignItems: 'center', gap: 3 }}>
              <Icon as={meta.icon} size={icon.lg - 2} strokeWidth={focused ? icon.strokeActive : icon.stroke} />
              <Text variant="tab" style={{ fontWeight: focused ? '700' : '500' }} maxFontSizeMultiplier={1.2}>
                {meta.label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: color.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },
  tab: { flex: 1, alignItems: 'center', minHeight: layout.minTouch + 8, paddingBottom: space[1] },
  indicator: { width: 20, height: 2, marginBottom: space[2], backgroundColor: 'transparent' },
});
