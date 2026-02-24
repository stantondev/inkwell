"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

interface NavCounts {
  draftCount: number;
  unreadNotificationCount: number;
  unreadLetterCount: number;
}

/**
 * Client component that re-fetches nav badge counts on every route change.
 * The root layout is a server component that only renders once — its counts
 * go stale during client-side navigation. This component keeps them fresh.
 */
export function useLiveNavCounts(initial: NavCounts): NavCounts {
  const [counts, setCounts] = useState(initial);
  const pathname = usePathname();

  useEffect(() => {
    // Update initial values when server-rendered props change (full page load)
    setCounts(initial);
  }, [initial.draftCount, initial.unreadNotificationCount, initial.unreadLetterCount]);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.data) return;
        setCounts({
          draftCount: data.data.draft_count ?? 0,
          unreadNotificationCount: data.data.unread_notification_count ?? 0,
          unreadLetterCount: data.data.unread_letter_count ?? 0,
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return counts;
}
