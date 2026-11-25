import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView as BaseWebView, type WebViewMessageEvent, type WebViewNavigation } from "react-native-webview";

// The library's default type parameter (undefined) collapses its props to
// `never` under TypeScript 6; pin it to "no extra props".
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
const WebView = BaseWebView<{}>;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type WebView = BaseWebView<{}>;
import * as WebBrowser from "expo-web-browser";
import { APP_USER_AGENT, SITE_URL, isInkwellUrl } from "./config";
import { SERIF, useTheme } from "./theme";

/** What the website sends the app (apps/web/src/lib/native-app.ts `AppMessage`). */
export type PageMessage =
  | { type: "session"; signedIn: boolean; username?: string | null; avatarUrl?: string | null; path: string }
  | { type: "counts"; notifications: number; letters: number; drafts: number }
  | { type: "share"; url: string; title?: string; text?: string }
  | { type: "haptic"; style?: "light" | "medium" | "success" };

export type InkwellWebViewHandle = {
  /** Go back inside this page's history. False when there is nothing to go back to. */
  goBack: () => boolean;
  /** Load another Inkwell path (or full URL) here. */
  open: (pathOrUrl: string) => void;
  /** Run a little JavaScript in the page. */
  run: (js: string) => void;
  /** Scroll to the top, or go to `root` when already there. */
  toTop: (root: string) => void;
  path: () => string;
};

type Props = {
  initialPath: string;
  onMessage?: (msg: PageMessage) => void;
  onPathChange?: (path: string) => void;
  /** Let this page follow sign-in links to other servers (Mastodon, Bluesky). */
  allowSignInElsewhere?: boolean;
};

const isOurs = isInkwellUrl;

/** Another server's sign-in page (Mastodon/Bluesky OAuth) that must come back here. */
const isOAuth = (url: URL) => /\/oauth\/|\/authorize|\/auth\//i.test(url.pathname);

export const InkwellWebView = forwardRef<InkwellWebViewHandle, Props>(function InkwellWebView(
  { initialPath, onMessage, onPathChange, allowSignInElsewhere = true },
  ref,
) {
  const theme = useTheme();
  const web = useRef<WebView>(null);
  const canGoBack = useRef(false);
  const currentUrl = useRef(`${SITE_URL}${initialPath}`);
  const [source] = useState(() => ({ uri: `${SITE_URL}${initialPath}` }));
  const [firstLoad, setFirstLoad] = useState(true);

  useImperativeHandle(ref, () => ({
    goBack: () => {
      if (!canGoBack.current) return false;
      web.current?.goBack();
      return true;
    },
    open: (pathOrUrl) => {
      const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${SITE_URL}${pathOrUrl}`;
      web.current?.injectJavaScript(`window.location.assign(${JSON.stringify(url)}); true;`);
    },
    run: (js) => web.current?.injectJavaScript(`${js}; true;`),
    toTop: (root) => {
      web.current?.injectJavaScript(`(function(){
        if (window.scrollY > 4) { window.scrollTo({ top: 0, behavior: "smooth" }); }
        else if (location.pathname !== ${JSON.stringify(root)}) { location.assign(${JSON.stringify(root)}); }
      })(); true;`);
    },
    path: () => {
      try {
        const u = new URL(currentUrl.current);
        return u.pathname + u.search;
      } catch {
        return initialPath;
      }
    },
  }));

  const handleMessage = useCallback(
    (e: WebViewMessageEvent) => {
      try {
        const msg = JSON.parse(e.nativeEvent.data) as PageMessage;
        if (msg && typeof msg.type === "string") onMessage?.(msg);
      } catch {
        /* not ours */
      }
    },
    [onMessage],
  );

  const handleNav = useCallback(
    (nav: WebViewNavigation) => {
      canGoBack.current = nav.canGoBack;
      currentUrl.current = nav.url;
      try {
        const u = new URL(nav.url);
        if (isOurs(u)) onPathChange?.(u.pathname + u.search);
      } catch {
        /* ignore */
      }
    },
    [onPathChange],
  );

  // Decide where a link opens: Inkwell pages here, everything else outside.
  const shouldStart = useCallback(
    (req: { url: string; isTopFrame?: boolean }) => {
      if (req.isTopFrame === false) return true;
      const raw = req.url;
      if (raw.startsWith("about:") || raw.startsWith("data:") || raw.startsWith("blob:")) return true;
      if (/^(mailto|tel|sms|intent|market):/i.test(raw)) {
        Linking.openURL(raw).catch(() => {});
        return false;
      }
      let url: URL;
      try {
        url = new URL(raw);
      } catch {
        return false;
      }
      if (isOurs(url)) return true;
      if (allowSignInElsewhere && isOAuth(url)) return true;
      WebBrowser.openBrowserAsync(raw, {
        toolbarColor: theme.surface,
        controlsColor: theme.accent,
        showTitle: true,
        enableDefaultShareMenuItem: true,
      }).catch(() => Linking.openURL(raw).catch(() => {}));
      return false;
    },
    [allowSignInElsewhere, theme.accent, theme.surface],
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <WebView
        ref={web}
        source={source}
        applicationNameForUserAgent={APP_USER_AGENT}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled={false}
        domStorageEnabled
        javaScriptEnabled
        allowsFullscreenVideo
        allowsBackForwardNavigationGestures
        mediaPlaybackRequiresUserAction
        setSupportMultipleWindows={false}
        overScrollMode="never"
        style={{ flex: 1, backgroundColor: theme.background }}
        onMessage={handleMessage}
        onNavigationStateChange={handleNav}
        onShouldStartLoadWithRequest={shouldStart}
        onLoadEnd={() => setFirstLoad(false)}
        // Any page that fails to load (no connection, server down) gets
        // Inkwell's own screen instead of Android's grey error page.
        renderError={() => (
          <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: theme.background }]}>
            <Text style={[styles.offlineTitle, { color: theme.foreground }]}>Inkwell can&rsquo;t be reached</Text>
            <Text style={[styles.offlineText, { color: theme.muted }]}>Check your connection, then try again.</Text>
            <Pressable onPress={() => web.current?.reload()} style={[styles.retry, { backgroundColor: theme.accent }]}>
              <Text style={{ color: theme.onAccent, fontWeight: "600" }}>Try again</Text>
            </Pressable>
          </View>
        )}
        onError={() => setFirstLoad(false)}
        onRenderProcessGone={() => {
          web.current?.reload();
          return true;
        }}
      />
      {firstLoad && (
        <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: theme.background }]} pointerEvents="none">
          <ActivityIndicator color={theme.accent} />
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  offlineTitle: { fontFamily: SERIF, fontSize: 20, marginBottom: 8 },
  offlineText: { fontSize: 15, textAlign: "center", marginBottom: 20 },
  retry: { paddingHorizontal: 22, paddingVertical: 12, borderRadius: 999 },
});
