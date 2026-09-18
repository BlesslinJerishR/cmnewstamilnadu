import type { NavigatorScreenParams } from '@react-navigation/native';
import type { ArticleSummary } from '@cmnews/shared';

export type TabParamList = {
  Home: undefined;
  Latest: undefined;
  Categories: undefined;
  /** `focus` is a timestamp: a new value asks the search field to take focus. */
  Search: { q?: string; focus?: number } | undefined;
  Saved: undefined;
};

export type RootStackParamList = {
  Onboarding: undefined;
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  Article: { id: string; summary?: ArticleSummary };
  Category: { slug: string; name?: string };
  Source: { domain: string; name?: string };
  Settings: undefined;
  About: undefined;
  Privacy: undefined;
  Account: undefined;
  Sources: undefined;
};
