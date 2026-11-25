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

  return null;
}
