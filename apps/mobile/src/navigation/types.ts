import type { NavigatorScreenParams } from '@react-navigation/native';
import type { ArticleSummary } from '@cmnews/shared';

export type TabParamList = {
  Home: undefined;
  Latest: undefined;
  Categories: undefined;
  Search: { q?: string } | undefined;
  Saved: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  Article: { id: string; summary?: ArticleSummary };
  Category: { slug: string; name?: string };
  Source: { domain: string; name?: string };
  Settings: undefined;
  About: undefined;
  Account: undefined;
  Sources: undefined;
};
