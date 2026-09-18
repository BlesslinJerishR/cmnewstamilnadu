import * as Linking from 'expo-linking';
import type { LinkingOptions } from '@react-navigation/native';
import { RootStackParamList } from './types';

/**
 * Deep links into the app, e.g. cmnews://article/123 or cmnews://category/welfare.
 * (Links to the publishers' original articles open in the browser, not here.)
 */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [Linking.createURL('/'), 'cmnews://'],
  config: {
    // Deep-linked screens open on top of the tabs, so "back" always leads somewhere.
    initialRouteName: 'Tabs',
    screens: {
      Tabs: {
        screens: {
          Home: '',
          Latest: 'latest',
          Categories: 'categories',
          Search: 'search',
          Saved: 'saved',
        },
      },
      Article: 'article/:id',
      Category: 'category/:slug',
      Source: 'source/:domain',
      Settings: 'settings',
      About: 'about',
    },
  },
};
