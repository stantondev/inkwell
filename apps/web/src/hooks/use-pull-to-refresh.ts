"use client";

import { useRef, useEffect, useState, useCallback } from "react";

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void> | void;
  threshold?: number;
  enabled?: boolean;
}

export function usePullToRefresh({
  onRefresh,
  threshold = 80,
  enabled = true,
}: UsePullToRefreshOptions) {
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);
  const isPulling = useRef(false);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!enabled || refreshing) return;
    if (window.scrollY > 5) return; // only activate at top
    touchStartY.current = e.touches[0].clientY;
    isPulling.current = false;
  }, [enabled, refreshing]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!enabled || refreshing) return;
    if (window.scrollY > 5) return;

    const dy = e.touches[0].clientY - touchStartY.current;
    if (dy > 10) {
      isPulling.current = true;
      // Dampen pull distance
      const dampened = Math.min(dy * 0.4, 120);
      setPullDistance(dampened);
    }
  }, [enabled, refreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling.current) return;
    isPulling.current = false;

    if (pullDistance >= threshold * 0.4) {
      setRefreshing(true);
      setPullDistance(0);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
      }
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, threshold, onRefresh]);

  useEffect(() => {
    if (!enabled) return;
    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: true });
    document.addEventListener("touchend", handleTouchEnd);
    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [enabled, handleTouchStart, handleTouchMove, handleTouchEnd]);

  return { refreshing, pullDistance, indicatorRef };
}
