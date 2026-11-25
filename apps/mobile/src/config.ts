import Constants from "expo-constants";
import { Platform } from "react-native";

/** The Inkwell server the app shows (app.config.ts `extra.siteUrl`). */
export const SITE_URL: string = (Constants.expoConfig?.extra?.siteUrl as string) ?? "https://inkwell.social";
export const SITE_HOST = new URL(SITE_URL).host;

/**
 * Is this address one of Inkwell's pages? On a local test server (plain http)
 * any port of the same machine counts: the local API writes sign-in links for
 * port 3000 while the app may be pointed at another port.
 */
export function isInkwellUrl(url: URL): boolean {
  if (SITE_URL.startsWith("http://")) return url.hostname === new URL(SITE_URL).hostname;
  return url.host === SITE_HOST;
}

const appVersion = Constants.expoConfig?.version ?? "0";

/**
 * Appended to the WebView's user agent. The website reads it
 * (apps/web/src/lib/native-app.ts) and leaves out what the app draws itself.
 */
export const APP_USER_AGENT = `InkwellApp/${appVersion} (${Platform.OS})`;

export const siteUrl = (path: string) => `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;

export type TabId = "feed" | "explore" | "alerts" | "you";

export const TAB_ROOTS: Record<TabId, string> = {
  feed: "/feed",
  explore: "/explore",
  alerts: "/notifications",
  you: "/you",
};

/** Pages that belong to signing in or setting up an account: shown without tabs. */
export function isSignInPath(path: string): boolean {
  return /^\/(login|get-started|welcome|auth|i\/|oauth)(\/|$|\?)?/.test(path) || path === "/";
}
