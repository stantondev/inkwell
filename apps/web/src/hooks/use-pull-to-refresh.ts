"use client";

import { useRef, useEffect, useState } from "react";

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void> | void;
  /** Finger travel (px) needed to trigger a refresh. */
  threshold?: number;
  enabled?: boolean;
}

/** True if the touch started inside something that is scrolled away from its top. */
function insideScrolledContent(target: EventTarget | null): boolean {
  let el = target instanceof Element ? target : null;
  while (el && el !== document.body && el !== document.documentElement) {
    if (el instanceof HTMLElement && el.scrollTop > 0) {
      const oy = getComputedStyle(el).overflowY;
      if (oy === "auto" || oy === "scroll") return true;
    }
    el = el.parentElement;
  }
  return false;
}

/**
 * Pull down at the very top of the page to refresh.
 *
 * Only a downward, mostly vertical pull that starts with the window at the top
 * *and* outside any scrolled container counts. Before, scrolling an entry's
 * body back up while the window sat at the top refreshed the page, and so did
 * the vertical wobble of a sideways page turn.
 */
export function usePullToRefresh({
  onRefresh,
  threshold = 80,
  enabled = true,
}: UsePullToRefreshOptions) {
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const indicatorRef = useRef<HTMLDivElement>(null);

  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const refreshingRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    let startX = 0;
    let startY = 0;
    let armed = false;   // touch began somewhere a pull is allowed
    let pulling = false; // direction confirmed as a downward pull
    let distance = 0;

    const onStart = (e: TouchEvent) => {
      armed = false;
      pulling = false;
      distance = 0;
      if (refreshingRef.current || e.touches.length !== 1 || window.scrollY > 2) return;
      if (insideScrolledContent(e.target)) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      armed = true;
    };

    const onMove = (e: TouchEvent) => {
      if (!armed) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (!pulling) {
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) { armed = false; return; }
        if (dy < -6) { armed = false; return; }
        if (dy > 12 && dy > Math.abs(dx) * 1.5) pulling = true;
        else return;
      }
      distance = Math.max(0, dy);
      setPullDistance(Math.min(distance * 0.4, 120));
    };

    const onEnd = async () => {
      const shouldRefresh = pulling && distance >= threshold;
      armed = false;
      pulling = false;
      distance = 0;
      setPullDistance(0);
      if (!shouldRefresh) return;
      refreshingRef.current = true;
      setRefreshing(true);
      try { navigator.vibrate?.(8); } catch { /* not supported */ }
      try {
        await onRefreshRef.current();
        // router.refresh() resolves before the new data paints; hold the spinner briefly.
        await new Promise((r) => setTimeout(r, 600));
      } finally {
        refreshingRef.current = false;
        setRefreshing(false);
      }
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onEnd);
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
  }, [enabled, threshold]);

  return { refreshing, pullDistance, indicatorRef };
}
