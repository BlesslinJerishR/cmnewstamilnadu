import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AboutScreen } from '../screens/AboutScreen';
import { AccountScreen } from '../screens/AccountScreen';
import { ArticleScreen } from '../screens/ArticleScreen';
import { CategoriesScreen } from '../screens/CategoriesScreen';
import { CategoryScreen } from '../screens/CategoryScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { LatestScreen } from '../screens/LatestScreen';
import { PrivacyScreen } from '../screens/PrivacyScreen';
import { SavedScreen } from '../screens/SavedScreen';
import { SearchScreen } from '../screens/SearchScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { SourceScreen } from '../screens/SourceScreen';
import { SourcesScreen } from '../screens/SourcesScreen';
import { color } from '../theme/tokens';
import { BottomTabBar } from './BottomTabBar';
import { RootStackParamList, TabParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<TabParamList>();

function TabNavigator() {
  return (
    <Tabs.Navigator
      tabBar={(props) => <BottomTabBar {...props} />}
      screenOptions={{ headerShown: false, animation: 'fade', sceneStyle: { backgroundColor: color.bg } }}
    >
      <Tabs.Screen name="Home" component={HomeScreen} />
      <Tabs.Screen name="Latest" component={LatestScreen} />
      <Tabs.Screen name="Categories" component={CategoriesScreen} />
      <Tabs.Screen name="Search" component={SearchScreen} />
      <Tabs.Screen name="Saved" component={SavedScreen} />
    </Tabs.Navigator>
  );
}

export function RootNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: color.bg },
        headerTintColor: color.fg,
        headerTitleStyle: { fontWeight: '700', fontSize: 16 },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        title: '',
        contentStyle: { backgroundColor: color.bg },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="Tabs" component={TabNavigator} options={{ headerShown: false }} />
      <Stack.Screen name="Article" component={ArticleScreen} />
      <Stack.Screen name="Category" component={CategoryScreen} />
      <Stack.Screen name="Source" component={SourceScreen} />
      <Stack.Screen name="Sources" component={SourcesScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="About" component={AboutScreen} />
      <Stack.Screen name="Privacy" component={PrivacyScreen} />
      <Stack.Screen name="Account" component={AccountScreen} options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
    </Stack.Navigator>
  );
}
