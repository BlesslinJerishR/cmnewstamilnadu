import { Linking, Share } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { color } from '../theme/tokens';

/** Only plain http(s) links from our API are ever opened. */
export function isSafeWebUrl(url: string): boolean {
  return /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(url);
}

/** Opens the publisher's original article in an in-app browser (black and white chrome). */
export async function openArticle(url: string): Promise<void> {
  if (!isSafeWebUrl(url)) return;
  try {
    await WebBrowser.openBrowserAsync(url, {
      toolbarColor: color.bg,
      controlsColor: color.fg,
      secondaryToolbarColor: color.bg,
      enableBarCollapsing: true,
      showTitle: true,
    });
  } catch {
    await Linking.openURL(url).catch(() => undefined);
  }
}

export async function openExternally(url: string): Promise<void> {
  if (isSafeWebUrl(url)) await Linking.openURL(url).catch(() => undefined);
}

export async function shareArticle(title: string, url: string, sourceName: string): Promise<void> {
  if (!isSafeWebUrl(url)) return;
  await Share.share({ message: `${title} (${sourceName})\n${url}`, url, title }).catch(() => undefined);
}
