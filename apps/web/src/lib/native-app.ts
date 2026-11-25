/**
 * Inkwell's Android (and later iOS) app is a native frame around these same
 * pages: native tabs and the system back button outside, the website inside.
 * The app adds "InkwellApp/<version>" to its WebView's user agent; the root
 * layout turns that into <body data-app="android|ios">, and the pages leave
 * out what the frame already draws (the bottom tab bar, the footer, "install
 * the app").
 */

const APP_UA = /\bInkwellApp\/([\d.]+)(?:\s*\((android|ios)\))?/i;

export type AppPlatform = "android" | "ios";

/** Server side: which app, if any, sent this request. */
export function appPlatformFromUserAgent(ua: string | null | undefined): AppPlatform | null {
  if (!ua) return null;
  const m = APP_UA.exec(ua);
  if (!m) return null;
  return (m[2]?.toLowerCase() as AppPlatform) || "android";
}

/** Client side: is this page inside the app? */
export function inApp(): boolean {
  return typeof document !== "undefined" && !!document.body?.dataset.app;
}

/** Messages the page sends the native frame (see apps/mobile). */
export type AppMessage =
  | { type: "session"; signedIn: boolean; username?: string | null; avatarUrl?: string | null; path: string }
  | { type: "counts"; notifications: number; letters: number; drafts: number }
  | { type: "share"; url: string; title?: string; text?: string }
  | { type: "haptic"; style?: "light" | "medium" | "success" };

type NativeBridge = { postMessage: (data: string) => void };

/** Send a message to the native frame. Does nothing on the website. */
export function postToApp(message: AppMessage): boolean {
  if (typeof window === "undefined") return false;
  const bridge = (window as unknown as { ReactNativeWebView?: NativeBridge }).ReactNativeWebView;
  if (!bridge) return false;
  try {
    bridge.postMessage(JSON.stringify(message));
    return true;
  } catch {
    return false;
  }
}
