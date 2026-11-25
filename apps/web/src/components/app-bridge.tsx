"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import type { SessionUser } from "@/lib/session";
import { postToApp } from "@/lib/native-app";

/**
 * Inside the Inkwell app only (AppShell renders it when the request came from
 * the app): tells the native frame who is signed in and where the page is, so
 * it can show its tabs, the You avatar and the Alerts badge. The unread counts
 * after that come from the nav count poll (live-nav-counts.tsx).
 */
export function AppBridge({ user }: { user: SessionUser | null }) {
  const pathname = usePathname();

  useEffect(() => {
    postToApp({
      type: "session",
      signedIn: !!user,
      username: user?.username ?? null,
      avatarUrl: user?.avatar_url ?? null,
      path: pathname,
    });
  }, [user, pathname]);

  useEffect(() => {
    if (!user) return;
    postToApp({
      type: "counts",
      notifications: user.unread_notification_count ?? 0,
      letters: user.unread_letter_count ?? 0,
      drafts: user.draft_count ?? 0,
    });
  }, [user]);

  // The app hands over this phone's notification token (apps/mobile/src/
  // notifications.ts): register it with the signed-in session, once per
  // token and account in this page's lifetime.
  useEffect(() => {
    if (!user) return;
    const register = (detail: AppPushDetail | undefined) => {
      if (!detail?.token) return;
      const key = `inkwell-app-push:${user.username}:${detail.token}`;
      try {
        if (sessionStorage.getItem(key)) return;
      } catch {
        /* private mode: just register */
      }
      fetch("/api/push/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: detail.token, platform: detail.platform, app_version: detail.appVersion }),
      })
        .then((res) => {
          if (!res.ok) return;
          try {
            sessionStorage.setItem(key, "1");
          } catch {
            /* fine */
          }
        })
        .catch(() => {});
    };
    const onPush = (e: Event) => register((e as CustomEvent<AppPushDetail>).detail);
    window.addEventListener("inkwell-app-push", onPush);
    register((window as unknown as { __inkwellPush?: AppPushDetail }).__inkwellPush);
    return () => window.removeEventListener("inkwell-app-push", onPush);
  }, [user]);

  return null;
}

type AppPushDetail = { token: string; platform?: string; appVersion?: string | null };
