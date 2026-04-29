"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

interface NavCounts {
  draftCount: number;
  unreadNotificationCount: number;
  unreadLetterCount: number;
}

const POLL_INTERVAL = 15_000; // 15 seconds when tab is in foreground — fast enough to feel near-instant
// 60 seconds when tab is in background. The visibilitychange handler refetches
// immediately on focus so users still see updates within milliseconds when
// they return to the tab. Backgrounded tabs polling at 15s burned 4× the
// `/api/auth/me` traffic for zero user benefit (notification sounds firing
// for a tab they're not looking at).
const BACKGROUND_POLL_INTERVAL = 60_000;
const BLINK_INTERVAL = 1500; // title blink speed (ms)

// --- Module-level shared state ---
// Multiple components use useLiveNavCounts simultaneously (sidebar, bottom tabs,
// mobile top bar). Without shared state, each instance runs independent polling
// and sound logic — causing duplicate sounds and false-positive "new notification"
// detection when router.refresh() resets one instance's prev counts.
let sharedPrevNotifications = -1; // -1 = uninitialized
let sharedPrevLetters = -1;
let lastSoundTime = 0;
const SOUND_DEBOUNCE_MS = 3000; // at most 1 sound per 3 seconds
let activePollingInstances = 0;

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
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioUnlockedRef = useRef(false);
  const soundsMutedRef = useRef(false);
  const hideBadgesRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  // Refs for tab title + favicon
  const blinkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const originalFaviconSvgRef = useRef<string | null>(null);
  const badgeFaviconRef = useRef<string | null>(null);
  const hasBadgeRef = useRef(false);

  // Update displayed counts when server-rendered props change (full page load)
  // Do NOT reset shared prev counts here — router.refresh() triggers this effect
  // and resetting prev counts would cause false-positive sound on the next poll.
  useEffect(() => {
    setCounts(initial);
    // Only initialize shared prev counts if they haven't been set yet
    if (sharedPrevNotifications === -1) {
      sharedPrevNotifications = initial.unreadNotificationCount;
      sharedPrevLetters = initial.unreadLetterCount;
    }
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

  // Unlock AudioContext on first user interaction (browser autoplay policy)
  useEffect(() => {
    const unlock = () => {
      if (!audioUnlockedRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
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
        const total = sharedPrevNotifications + sharedPrevLetters;
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

  // Synthesize a gentle two-note chime via Web Audio API
  // No external file needed — produces a soft, pleasant "ding-ding"
  const playSound = useCallback(() => {
    if (soundsMutedRef.current || !audioUnlockedRef.current) return;
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    // Resume context if it was suspended (browser policy)
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const volume = 0.15; // gentle volume

    // Helper: play one soft tone
    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      // Soft attack, gentle decay
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(volume, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + duration);
    };

    // Two ascending notes: E5 (659 Hz) then A5 (880 Hz) — pleasant major fourth
    playTone(659, 0, 0.25);
    playTone(880, 0.15, 0.3);
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

        // Read preferences from server settings
        soundsMutedRef.current =
          !!data.data.settings?.notification_sounds_muted;
        hideBadgesRef.current =
          !!data.data.settings?.hide_notification_badges;

        // Sync eye comfort mode from server → body class + localStorage
        const eyeComfort = !!data.data.settings?.eye_comfort_mode;
        document.body.classList.toggle("eye-comfort", eyeComfort);
        localStorage.setItem("inkwell-eye-comfort", eyeComfort ? "true" : "false");

        // Sync sidebar hidden state from server → localStorage (for flash prevention script)
        const serverSidebarHidden = data.data.settings?.sidebar_hidden;
        if (serverSidebarHidden !== undefined) {
          localStorage.setItem("inkwell-sidebar-hidden", serverSidebarHidden ? "true" : "false");
        }

        // Sync editor panel state from server → localStorage
        const serverEditorPanel = data.data.settings?.editor_panel_open;
        if (serverEditorPanel !== undefined) {
          localStorage.setItem("inkwell-editor-panel", serverEditorPanel ? "open" : "collapsed");
        }

        // One-time migration: localStorage → DB settings
        // Runs once per browser to persist existing preferences to the server
        if (!localStorage.getItem("inkwell-settings-migrated")) {
          const patch: Record<string, unknown> = {};

          if (localStorage.getItem("inkwell-push-prompt-dismissed") === "true") {
            patch.push_prompt_dismissed = true;
          }

          const eduCards: string[] = [];
          if (localStorage.getItem("inkwell-edu-feed-card") === "true") eduCards.push("inkwell-edu-feed-card");
          if (localStorage.getItem("inkwell-edu-explore-card-v2") === "true") eduCards.push("inkwell-edu-explore-card-v2");
          if (eduCards.length > 0) patch.dismissed_education_cards = eduCards;

          if (localStorage.getItem("inkwell-sidebar-hidden") === "true") {
            patch.sidebar_hidden = true;
          }

          const musicPref = localStorage.getItem("inkwell_music_autoplay");
          if (musicPref !== null) {
            patch.music_autoplay = musicPref !== "false";
          }

          const editorPanel = localStorage.getItem("inkwell-editor-panel");
          if (editorPanel) {
            patch.editor_panel_open = editorPanel !== "collapsed";
          }

          if (Object.keys(patch).length > 0) {
            fetch("/api/me", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ settings: patch }),
            }).catch(() => {});
          }

          localStorage.setItem("inkwell-settings-migrated", "true");
        }

        // Detect new arrivals using module-level shared prev counts
        // (prevents duplicate sounds from multiple hook instances)
        const hasNewNotification =
          newCounts.unreadNotificationCount > sharedPrevNotifications ||
          newCounts.unreadLetterCount > sharedPrevLetters;

        if (hasNewNotification && !hideBadgesRef.current) {
          const now = Date.now();
          if (now - lastSoundTime > SOUND_DEBOUNCE_MS) {
            playSound();
            startTitleBlink();
            lastSoundTime = now;
          }
        }

        // Update shared prev counts so other instances see the same baseline
        sharedPrevNotifications = newCounts.unreadNotificationCount;
        sharedPrevLetters = newCounts.unreadLetterCount;

        // When badges are hidden, suppress displayed counts
        if (hideBadgesRef.current) {
          newCounts.unreadNotificationCount = 0;
          newCounts.unreadLetterCount = 0;
        }

        // Update tab title with total unread count
        const total =
          newCounts.unreadNotificationCount + newCounts.unreadLetterCount;
        if (!blinkIntervalRef.current) {
          updateTabTitle(total);
        }

        // Update favicon badge
        updateFaviconBadge(total > 0);

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

  // Periodic polling — only the first active instance runs the interval.
  // Multiple hook instances (sidebar, bottom tabs, mobile top bar) would
  // otherwise create 3 independent polling loops.
  useEffect(() => {
    activePollingInstances++;
    const isLeader = activePollingInstances === 1;

    if (!isLeader) {
      // Non-leader instances still refetch on mount but don't start polling
      return () => { activePollingInstances--; };
    }

    const startPolling = (interval: number) => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(refetch, interval);
    };

    const handleVisibility = () => {
      if (document.hidden) {
        startPolling(BACKGROUND_POLL_INTERVAL);
      } else {
        refetch();
        startPolling(POLL_INTERVAL);
      }
    };

    startPolling(document.hidden ? BACKGROUND_POLL_INTERVAL : POLL_INTERVAL);

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      activePollingInstances--;
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refetch]);

  return counts;
}
