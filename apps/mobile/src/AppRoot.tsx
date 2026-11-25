import { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler, Image, Keyboard, Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import * as Haptics from "expo-haptics";
import { InkwellWebView, type InkwellWebViewHandle, type PageMessage } from "./InkwellWebView";
import { SITE_URL, TAB_ROOTS, isInkwellUrl, isSignInPath, type TabId } from "./config";
import { SERIF, useTheme } from "./theme";
import { AlertsIcon, CloseIcon, EntryIcon, ExploreIcon, FeedIcon, PenIcon, StickyIcon, YouIcon } from "./icons";

SplashScreen.preventAutoHideAsync().catch(() => {});

type Mode = "starting" | "signin" | "tabs";
type Session = { username: string | null; avatarUrl: string | null };

/** An inkwell.social link the app was opened with (email sign-in links, shared posts). */
function pathFromLink(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!isInkwellUrl(u) && u.protocol !== "inkwell:") return null;
    return (u.pathname || "/") + u.search;
  } catch {
    return null;
  }
}

export default function AppRoot() {
  return (
    <SafeAreaProvider>
      <Frame />
    </SafeAreaProvider>
  );
}

function Frame() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>("starting");
  const [signInPath, setSignInPath] = useState("/feed");
  const [signInKey, setSignInKey] = useState(0);
  const [session, setSession] = useState<Session>({ username: null, avatarUrl: null });
  const [tab, setTab] = useState<TabId>("feed");
  const [visited, setVisited] = useState<Set<TabId>>(new Set(["feed"]));
  const [counts, setCounts] = useState({ notifications: 0, letters: 0 });
  const [writeOpen, setWriteOpen] = useState(false);
  const [editor, setEditor] = useState<string | null>(null);
  const [keyboard, setKeyboard] = useState(false);
  const pendingLink = useRef<string | null>(null);

  const signInView = useRef<InkwellWebViewHandle>(null);
  const editorView = useRef<InkwellWebViewHandle>(null);
  const tabViews = useRef<Record<TabId, InkwellWebViewHandle | null>>({ feed: null, explore: null, alerts: null, you: null });

  // The first page tells us whether someone is signed in; until then, the splash.
  const onSessionFrom = useCallback(
    (where: "signin" | "tab", msg: Extract<PageMessage, { type: "session" }>) => {
      SplashScreen.hideAsync().catch(() => {});
      if (msg.signedIn) setSession({ username: msg.username ?? null, avatarUrl: msg.avatarUrl ?? null });
      if (where === "signin") {
        if (msg.signedIn && !isSignInPath(msg.path)) {
          setMode("tabs");
        } else {
          setMode("signin");
        }
      } else if (!msg.signedIn) {
        // Signed out (or the session ended) while using the tabs.
        setSignInPath("/login");
        setSignInKey((k) => k + 1);
        setMode("signin");
        setVisited(new Set(["feed"]));
        setTab("feed");
      }
    },
    [],
  );

  const handleMessage = useCallback(
    (where: "signin" | "tab") => (msg: PageMessage) => {
      if (msg.type === "session") onSessionFrom(where, msg);
      else if (msg.type === "counts") setCounts({ notifications: msg.notifications, letters: msg.letters });
      else if (msg.type === "haptic") {
        if (msg.style === "success") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        else Haptics.impactAsync(msg.style === "medium" ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
    },
    [onSessionFrom],
  );

  // Links that open the app: an emailed sign-in link, or any inkwell.social page.
  useEffect(() => {
    const route = (url: string | null | undefined) => {
      const path = pathFromLink(url);
      if (!path) return;
      if (mode === "tabs" && !path.startsWith("/auth/")) {
        tabViews.current[tab]?.open(path);
      } else {
        setSignInPath(path);
        setSignInKey((k) => k + 1);
        if (mode !== "starting") setMode("signin");
      }
    };
    if (pendingLink.current === null) {
      pendingLink.current = "";
      Linking.getInitialURL().then(route).catch(() => {});
    }
    const sub = Linking.addEventListener("url", (e) => route(e.url));
    return () => sub.remove();
  }, [mode, tab]);

  // The tab bar steps aside for the keyboard, as on the website.
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setKeyboard(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboard(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // The phone's back button: back inside the page first, then to Feed, then out.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (editor) {
        if (editorView.current?.goBack()) return true;
        setEditor(null);
        return true;
      }
      if (writeOpen) {
        setWriteOpen(false);
        return true;
      }
      if (mode === "signin") return signInView.current?.goBack() ?? false;
      if (mode === "tabs") {
        if (tabViews.current[tab]?.goBack()) return true;
        if (tab !== "feed") {
          setTab("feed");
          return true;
        }
      }
      return false;
    });
    return () => sub.remove();
  }, [editor, writeOpen, mode, tab]);

  const selectTab = (id: TabId) => {
    Haptics.selectionAsync().catch(() => {});
    if (id === tab) {
      tabViews.current[id]?.toTop(TAB_ROOTS[id]);
      return;
    }
    setVisited((v) => (v.has(id) ? v : new Set(v).add(id)));
    setTab(id);
  };

  const openEditor = () => {
    setWriteOpen(false);
    setEditor("/editor");
  };

  const jotSticky = () => {
    setWriteOpen(false);
    tabViews.current[tab]?.run(`window.dispatchEvent(new CustomEvent("inkwell-open-jot"))`);
  };

  // When the editor leaves /editor (published, or opened the entry), show that page in the tab.
  const onEditorPath = (path: string) => {
    if (path.startsWith("/editor") || path.startsWith("/preview") || path.startsWith("/login")) return;
    setEditor(null);
    tabViews.current[tab]?.open(path);
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.surface }}>
      <StatusBar style={theme.dark ? "light" : "dark"} />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        {mode !== "tabs" && (
          // No tab bar here, so keep the page clear of Android's navigation buttons.
          <View style={{ flex: 1, paddingBottom: insets.bottom }}>
            <InkwellWebView
              key={`signin-${signInKey}`}
              ref={signInView}
              initialPath={signInPath}
              onMessage={handleMessage("signin")}
            />
          </View>
        )}

        {mode === "tabs" && (
          <View style={{ flex: 1 }}>
            {(Object.keys(TAB_ROOTS) as TabId[]).map((id) =>
              visited.has(id) ? (
                <View key={id} style={[StyleSheet.absoluteFill, { display: id === tab ? "flex" : "none" }]}>
                  <InkwellWebView
                    ref={(r) => {
                      tabViews.current[id] = r;
                    }}
                    initialPath={TAB_ROOTS[id]}
                    onMessage={handleMessage("tab")}
                  />
                </View>
              ) : null,
            )}
          </View>
        )}
      </SafeAreaView>

      {mode === "tabs" && !keyboard && (
        <TabBar
          tab={tab}
          onSelect={selectTab}
          onWrite={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            setWriteOpen((v) => !v);
          }}
          writeOpen={writeOpen}
          alerts={counts.notifications}
          avatarUrl={session.avatarUrl}
        />
      )}

      <WriteSheet open={writeOpen} onClose={() => setWriteOpen(false)} onEntry={openEditor} onSticky={jotSticky} />

      <Modal visible={editor !== null} animationType="slide" onRequestClose={() => setEditor(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.surface }} edges={["top", "bottom", "left", "right"]}>
          {editor && (
            <InkwellWebView ref={editorView} initialPath={editor} onPathChange={onEditorPath} onMessage={handleMessage("tab")} />
          )}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

function TabBar({
  tab,
  onSelect,
  onWrite,
  writeOpen,
  alerts,
  avatarUrl,
}: {
  tab: TabId;
  onSelect: (t: TabId) => void;
  onWrite: () => void;
  writeOpen: boolean;
  alerts: number;
  avatarUrl: string | null;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const color = (t: TabId) => (t === tab ? theme.accent : theme.muted);
  const avatar = avatarUrl ? (avatarUrl.startsWith("http") ? avatarUrl : `${SITE_URL}${avatarUrl}`) : null;

  return (
    <View
      style={[
        styles.tabBar,
        { backgroundColor: theme.surface, borderTopColor: theme.border, paddingBottom: insets.bottom, height: 58 + insets.bottom },
      ]}
      accessibilityRole="tablist"
    >
      <Tab label="Feed" active={tab === "feed"} onPress={() => onSelect("feed")}>
        <FeedIcon color={color("feed")} />
      </Tab>
      <Tab label="Explore" active={tab === "explore"} onPress={() => onSelect("explore")}>
        <ExploreIcon color={color("explore")} />
      </Tab>
      <View style={styles.writeSlot}>
        <Pressable
          onPress={onWrite}
          accessibilityRole="button"
          accessibilityLabel="Write"
          accessibilityState={{ expanded: writeOpen }}
          style={({ pressed }) => [styles.fab, { backgroundColor: theme.accent, transform: [{ scale: pressed ? 0.94 : 1 }] }]}
        >
          {writeOpen ? <CloseIcon color={theme.onAccent} /> : <PenIcon color={theme.onAccent} />}
        </Pressable>
      </View>
      <Tab label="Alerts" active={tab === "alerts"} onPress={() => onSelect("alerts")} badge={alerts}>
        <AlertsIcon color={color("alerts")} />
      </Tab>
      <Tab label="You" active={tab === "you"} onPress={() => onSelect("you")}>
        {avatar ? (
          <Image
            source={{ uri: avatar }}
            style={[styles.avatar, { borderColor: tab === "you" ? theme.accent : theme.border }]}
          />
        ) : (
          <YouIcon color={color("you")} />
        )}
      </Tab>
    </View>
  );
}

function Tab({
  label,
  active,
  onPress,
  badge = 0,
  children,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  badge?: number;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={styles.tab}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={badge > 0 ? `${label}, ${badge} unread` : label}
      android_ripple={{ color: theme.border, borderless: true, radius: 32 }}
    >
      <View>
        {children}
        {badge > 0 && (
          <View style={[styles.badge, { backgroundColor: theme.danger }]}>
            <Text style={styles.badgeText}>{badge > 9 ? "9+" : badge}</Text>
          </View>
        )}
      </View>
      <Text style={[styles.tabLabel, { color: active ? theme.accent : theme.muted }]}>{label}</Text>
    </Pressable>
  );
}

function WriteSheet({
  open,
  onClose,
  onEntry,
  onSticky,
}: {
  open: boolean;
  onClose: () => void;
  onEntry: () => void;
  onSticky: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.scrim, { backgroundColor: theme.scrim }]} onPress={onClose} accessibilityLabel="Close" />
      <View
        style={[
          styles.sheet,
          { backgroundColor: theme.surface, borderColor: theme.border, paddingBottom: insets.bottom + 20 },
        ]}
      >
        <View style={[styles.sheetHandle, { backgroundColor: theme.border }]} />
        <Text style={[styles.sheetTitle, { color: theme.foreground }]}>Write</Text>
        <SheetOption
          title="Journal entry"
          sub="Title, words, pictures"
          icon={<EntryIcon color={theme.accent} />}
          onPress={onEntry}
        />
        <SheetOption
          title="Jot a sticky"
          sub="A quick thought, 500 characters"
          icon={<StickyIcon color={theme.accent} />}
          onPress={onSticky}
        />
      </View>
    </Modal>
  );
}

function SheetOption({ title, sub, icon, onPress }: { title: string; sub: string; icon: React.ReactNode; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.option, { borderColor: theme.border, backgroundColor: pressed ? theme.background : "transparent" }]}
      accessibilityRole="button"
    >
      <View style={styles.optionIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.optionTitle, { color: theme.foreground }]}>{title}</Text>
        <Text style={[styles.optionSub, { color: theme.muted }]}>{sub}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-around",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 6,
  },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 48 },
  tabLabel: { fontFamily: SERIF, fontStyle: "italic", fontSize: 11, marginTop: 2 },
  writeSlot: { flex: 1, alignItems: "center" },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -18,
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  avatar: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5 },
  badge: {
    position: "absolute",
    top: -4,
    right: -10,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  scrim: { ...StyleSheet.absoluteFill },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  sheetHandle: { alignSelf: "center", width: 36, height: 4, borderRadius: 2, marginBottom: 12 },
  sheetTitle: { fontFamily: SERIF, fontSize: 20, marginBottom: 10 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  optionIcon: { width: 28, alignItems: "center" },
  optionTitle: { fontSize: 16, fontWeight: "600" },
  optionSub: { fontSize: 13, marginTop: 2 },
});
