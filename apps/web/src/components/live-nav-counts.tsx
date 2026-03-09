"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

interface NavCounts {
  draftCount: number;
  unreadNotificationCount: number;
  unreadLetterCount: number;
}

const POLL_INTERVAL = 30_000; // 30 seconds

/**
 * Client component that re-fetches nav badge counts on every route change,
 * on "inkwell-nav-refresh" events, and via periodic 30-second polling.
 * Plays a notification sound when unread counts increase.
 */
export function useLiveNavCounts(initial: NavCounts): NavCounts {
  const [counts, setCounts] = useState(initial);
  const pathname = usePathname();

  // Refs for polling + sound
  const prevCountsRef = useRef(initial);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUnlockedRef = useRef(false);
  const soundsMutedRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  // Update initial values when server-rendered props change (full page load)
  useEffect(() => {
    setCounts(initial);
    prevCountsRef.current = initial;
  }, [initial.draftCount, initial.unreadNotificationCount, initial.unreadLetterCount]);

  // Unlock audio on first user interaction (browser autoplay policy)
  useEffect(() => {
    const unlock = () => {
      if (!audioUnlockedRef.current) {
        audioRef.current = new Audio("/sounds/notification.wav");
        audioRef.current.volume = 0.4;
        audioRef.current.load();
        audioUnlockedRef.current = true;
      }
      document.removeEventListener("click", unlock);
      document.removeEventListener("keydown", unlock);
    };
    document.addEventListener("click", unlock);
    document.addEventListener("keydown", unlock);
    return () => {
      document.removeEventListener("click", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const playSound = useCallback(() => {
    if (soundsMutedRef.current || !audioUnlockedRef.current || !audioRef.current)
      return;
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => {
      // Autoplay blocked — ignore silently
    });
  }, []);

  const refetch = useCallback(() => {
    fetch("/api/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.data || !mountedRef.current) return;

        const newCounts: NavCounts = {
          draftCount: data.data.draft_count ?? 0,
          unreadNotificationCount: data.data.unread_notification_count ?? 0,
          unreadLetterCount: data.data.unread_letter_count ?? 0,
        };

        // Read mute preference from server settings
        soundsMutedRef.current =
          !!data.data.settings?.notification_sounds_muted;

        // Play sound when notification or letter count increases
        const prev = prevCountsRef.current;
        if (
          newCounts.unreadNotificationCount >
            prev.unreadNotificationCount ||
          newCounts.unreadLetterCount > prev.unreadLetterCount
        ) {
          playSound();
        }

        prevCountsRef.current = newCounts;
        setCounts(newCounts);
      })
      .catch(() => {});
  }, [playSound]);

  // Refetch on pathname change (existing behavior)
  useEffect(() => {
    refetch();
  }, [pathname, refetch]);

  // Refetch when any component fires the custom event (existing behavior)
  useEffect(() => {
    const handler = () => refetch();
    window.addEventListener("inkwell-nav-refresh", handler);
    return () => window.removeEventListener("inkwell-nav-refresh", handler);
  }, [refetch]);

  // Periodic polling with Page Visibility API
  useEffect(() => {
    const startPolling = () => {
      if (intervalRef.current) return;
      intervalRef.current = setInterval(refetch, POLL_INTERVAL);
    };

    const stopPolling = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    const handleVisibility = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        // Tab became visible — refetch immediately, then resume interval
        refetch();
        startPolling();
      }
    };

    // Start polling if tab is currently visible
    if (!document.hidden) {
      startPolling();
    }

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refetch]);

  return counts;
}
