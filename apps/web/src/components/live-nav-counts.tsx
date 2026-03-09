"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

interface NavCounts {
  draftCount: number;
  unreadNotificationCount: number;
  unreadLetterCount: number;
}

const POLL_INTERVAL = 30_000; // 30 seconds
const BLINK_INTERVAL = 1500; // title blink speed (ms)

// --- Favicon badge helpers ---

const ORIGINAL_FAVICON = "/favicon.svg";

/** Draw the original favicon SVG with a red notification dot overlay */
function createBadgeFavicon(
  svgText: string,
  callback: (href: string) => void
) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const img = new Image();
  img.onload = () => {
    ctx.drawImage(img, 0, 0, 64, 64);
    // Red dot in top-right corner
    ctx.beginPath();
    ctx.arc(52, 12, 12, 0, Math.PI * 2);
    ctx.fillStyle = "#ef4444";
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
    callback(canvas.toDataURL("image/png"));
  };
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgText);
}

function setFavicon(href: string) {
  let link = document.querySelector(
    'link[rel="icon"]'
  ) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = href;
}

// --- Title helpers ---

/** Get the base page title without any notification prefix */
function getBaseTitle(): string {
  const raw = document.title;
  // Strip existing "(N) " prefix if present
  return raw.replace(/^\(\d+\)\s*/, "");
}

/**
 * Client component that re-fetches nav badge counts on every route change,
 * on "inkwell-nav-refresh" events, and via periodic 30-second polling.
 * Plays a notification sound when unread counts increase.
 * Updates browser tab title with unread count and blinks on new arrivals.
 * Shows a red badge dot on the favicon when there are unread items.
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

  // Refs for tab title + favicon
  const blinkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const originalFaviconSvgRef = useRef<string | null>(null);
  const badgeFaviconRef = useRef<string | null>(null);
  const hasBadgeRef = useRef(false);

  // Update initial values when server-rendered props change (full page load)
  useEffect(() => {
    setCounts(initial);
    prevCountsRef.current = initial;
  }, [initial.draftCount, initial.unreadNotificationCount, initial.unreadLetterCount]);

  // Load original favicon SVG text once (needed for badge overlay)
  useEffect(() => {
    fetch(ORIGINAL_FAVICON)
      .then((r) => (r.ok ? r.text() : null))
      .then((text) => {
        if (text) originalFaviconSvgRef.current = text;
      })
      .catch(() => {});
  }, []);

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

  // --- Tab title: show count prefix like "(3) Feed · Inkwell" ---
  const updateTabTitle = useCallback((total: number) => {
    const base = getBaseTitle();
    document.title = total > 0 ? `(${total}) ${base}` : base;
  }, []);

  // --- Favicon badge: red dot overlay ---
  const updateFaviconBadge = useCallback((show: boolean) => {
    if (show === hasBadgeRef.current) return;
    hasBadgeRef.current = show;

    if (!show) {
      setFavicon(ORIGINAL_FAVICON);
      return;
    }

    // If we already generated the badge image, reuse it
    if (badgeFaviconRef.current) {
      setFavicon(badgeFaviconRef.current);
      return;
    }

    // Generate badge favicon from SVG
    const svgText = originalFaviconSvgRef.current;
    if (!svgText) return;
    createBadgeFavicon(svgText, (href) => {
      badgeFaviconRef.current = href;
      if (hasBadgeRef.current) setFavicon(href);
    });
  }, []);

  // --- Title blink: "✦ New notification · Inkwell" alternating ---
  const startTitleBlink = useCallback(() => {
    // Don't blink if tab is visible — user can already see the badge
    if (!document.hidden) return;

    // Stop any existing blink
    if (blinkIntervalRef.current) {
      clearInterval(blinkIntervalRef.current);
    }

    const base = getBaseTitle();
    let showAlert = true;
    blinkIntervalRef.current = setInterval(() => {
      if (showAlert) {
        document.title = `✦ New notification — ${base}`;
      } else {
        const total =
          prevCountsRef.current.unreadNotificationCount +
          prevCountsRef.current.unreadLetterCount;
        document.title = total > 0 ? `(${total}) ${base}` : base;
      }
      showAlert = !showAlert;
    }, BLINK_INTERVAL);
  }, []);

  const stopTitleBlink = useCallback(() => {
    if (blinkIntervalRef.current) {
      clearInterval(blinkIntervalRef.current);
      blinkIntervalRef.current = null;
    }
  }, []);

  // Stop blinking when user returns to the tab
  useEffect(() => {
    const handleFocus = () => {
      stopTitleBlink();
      // Restore normal title with count
      const total = counts.unreadNotificationCount + counts.unreadLetterCount;
      updateTabTitle(total);
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [counts, stopTitleBlink, updateTabTitle]);

  // Cleanup blink on unmount
  useEffect(() => {
    return () => stopTitleBlink();
  }, [stopTitleBlink]);

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

        // Detect new arrivals
        const prev = prevCountsRef.current;
        const hasNewNotification =
          newCounts.unreadNotificationCount > prev.unreadNotificationCount ||
          newCounts.unreadLetterCount > prev.unreadLetterCount;

        if (hasNewNotification) {
          playSound();
          startTitleBlink();
        }

        // Update tab title with total unread count
        const total =
          newCounts.unreadNotificationCount + newCounts.unreadLetterCount;
        if (!blinkIntervalRef.current) {
          updateTabTitle(total);
        }

        // Update favicon badge
        updateFaviconBadge(total > 0);

        prevCountsRef.current = newCounts;
        setCounts(newCounts);
      })
      .catch(() => {});
  }, [playSound, startTitleBlink, updateTabTitle, updateFaviconBadge]);

  // Refetch on pathname change (existing behavior)
  // Also update tab title since the base page name changed
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
