import { Pressable } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { T } from '../components/ui';
import { AboutScreen } from '../screens/AboutScreen';
import { AccountScreen } from '../screens/AccountScreen';
import { ArticleScreen } from '../screens/ArticleScreen';
import { CategoriesScreen } from '../screens/CategoriesScreen';
import { CategoryScreen } from '../screens/CategoryScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { LatestScreen } from '../screens/LatestScreen';
import { SavedScreen } from '../screens/SavedScreen';
import { SearchScreen } from '../screens/SearchScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { SourceScreen } from '../screens/SourceScreen';
import { SourcesScreen } from '../screens/SourcesScreen';
import { useTheme } from '../theme/theme';
import { RootStackParamList, TabParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<TabParamList>();

type IconName = keyof typeof Ionicons.glyphMap;
// Active tabs use the filled glyph, inactive the outline: distinguishable without colour.
const ICONS: Record<keyof TabParamList, [IconName, IconName]> = {
  Home: ['newspaper', 'newspaper-outline'],
  Latest: ['time', 'time-outline'],
  Categories: ['grid', 'grid-outline'],
  Search: ['search', 'search-outline'],
  Saved: ['bookmark', 'bookmark-outline'],
};

function SettingsButton() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { fg } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Settings" hitSlop={12} onPress={() => navigation.navigate('Settings')} style={{ paddingHorizontal: 12 }}>
      <Ionicons name="settings-outline" size={22} color={fg} />
    </Pressable>
  );
}

function TabNavigator() {
  const { fg, bg } = useTheme();
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: bg },
        headerTintColor: fg,
        headerTitleStyle: { fontWeight: '900' },
        headerShadowVisible: false,
        headerRight: () => <SettingsButton />,
        tabBarStyle: { backgroundColor: bg, borderTopColor: fg, borderTopWidth: 2 },
        tabBarActiveTintColor: fg,
        tabBarInactiveTintColor: fg,
        tabBarLabel: ({ focused, children }) => (
          <T variant="small" style={{ fontSize: 11, fontWeight: focused ? '900' : '400', textDecorationLine: focused ? 'underline' : 'none' }}>
            {children}
          </T>
        ),
        tabBarIcon: ({ focused, size }) => <Ionicons name={ICONS[route.name][focused ? 0 : 1]} size={size} color={fg} />,
      })}
    >
      <Tabs.Screen name="Home" component={HomeScreen as never} options={{ headerTitle: 'CM News' }} />
      <Tabs.Screen name="Latest" component={LatestScreen} />
      <Tabs.Screen name="Categories" component={CategoriesScreen as never} />
      <Tabs.Screen name="Search" component={SearchScreen} />
      <Tabs.Screen name="Saved" component={SavedScreen as never} />
    </Tabs.Navigator>
  );
}

export function RootNavigator() {
  const { fg, bg } = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: bg },
        headerTintColor: fg,
        headerTitleStyle: { fontWeight: '900' },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: bg },
      }}
    >
      <Stack.Screen name="Tabs" component={TabNavigator} options={{ headerShown: false }} />
      <Stack.Screen name="Article" component={ArticleScreen} options={{ title: '' }} />
      <Stack.Screen name="Category" component={CategoryScreen} />
      <Stack.Screen name="Source" component={SourceScreen} />
      <Stack.Screen name="Sources" component={SourcesScreen} options={{ title: 'News sources' }} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="About" component={AboutScreen} />
      <Stack.Screen name="Account" component={AccountScreen} options={{ title: 'Account', presentation: 'modal' }} />
    </Stack.Navigator>
  );
}
