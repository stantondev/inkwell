"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

interface NavCounts {
  draftCount: number;
  unreadNotificationCount: number;
  unreadLetterCount: number;
}

/**
 * Client component that re-fetches nav badge counts on every route change
 * and when any component dispatches the "inkwell-nav-refresh" event.
 */
export function useLiveNavCounts(initial: NavCounts): NavCounts {
  const [counts, setCounts] = useState(initial);
  const pathname = usePathname();

  useEffect(() => {
    // Update initial values when server-rendered props change (full page load)
    setCounts(initial);
  }, [initial.draftCount, initial.unreadNotificationCount, initial.unreadLetterCount]);

  const refetch = useCallback(() => {
    fetch("/api/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.data) return;
        setCounts({
          draftCount: data.data.draft_count ?? 0,
          unreadNotificationCount: data.data.unread_notification_count ?? 0,
          unreadLetterCount: data.data.unread_letter_count ?? 0,
        });
      })
      .catch(() => {});
  }, []);

  // Refetch on pathname change
  useEffect(() => {
    refetch();
  }, [pathname, refetch]);

  // Refetch when any component fires the custom event
  useEffect(() => {
    const handler = () => refetch();
    window.addEventListener("inkwell-nav-refresh", handler);
    return () => window.removeEventListener("inkwell-nav-refresh", handler);
  }, [refetch]);

  return counts;
}
