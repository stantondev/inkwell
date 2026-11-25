import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * Phone notifications for the Inkwell app, sent by the API through Firebase
 * Cloud Messaging (apps/api/lib/inkwell/push/fcm.ex). Each carries `url`, the
 * Inkwell page to open when it's tapped.
 */

// While the app is open, the page's own pop-ups (notification-toaster.tsx)
// already show new notifications, so don't stack a system banner on top.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function ensureChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("default", {
    name: "Notifications",
    description: "Comments, letters, stamps, pen pal requests and more",
    importance: Notifications.AndroidImportance.HIGH,
    lightColor: "#2d4a8a",
  });
}

/**
 * The phone's Firebase token, asking for permission the first time (Android
 * 13+ shows the system prompt once). Null if declined or unavailable.
 */
export async function pushToken(): Promise<string | null> {
  try {
    await ensureChannel();
    let { status, canAskAgain } = await Notifications.getPermissionsAsync();
    if (status !== "granted" && canAskAgain) {
      ({ status } = await Notifications.requestPermissionsAsync());
    }
    if (status !== "granted") return null;
    const token = await Notifications.getDevicePushTokenAsync();
    return typeof token.data === "string" ? token.data : null;
  } catch {
    return null;
  }
}

/** JS that hands the token to the page, which registers it with the signed-in session (app-bridge.tsx). */
export function tokenScript(token: string) {
  const detail = JSON.stringify({ token, platform: Platform.OS, appVersion: Constants.expoConfig?.version ?? null });
  return `window.__inkwellPush = ${detail}; window.dispatchEvent(new CustomEvent("inkwell-app-push", { detail: window.__inkwellPush }))`;
}

function pathOf(response: Notifications.NotificationResponse | null): string | null {
  const url = response?.notification.request.content.data?.url;
  return typeof url === "string" && url.startsWith("/") ? url : null;
}

/** Calls `open` with the page of a tapped notification (also the one that started the app). */
export function onNotificationTap(open: (path: string) => void) {
  Notifications.getLastNotificationResponseAsync()
    .then((r) => {
      const p = pathOf(r);
      if (p) open(p);
    })
    .catch(() => {});
  const sub = Notifications.addNotificationResponseReceivedListener((r) => {
    const p = pathOf(r);
    if (p) open(p);
  });
  return () => sub.remove();
}
