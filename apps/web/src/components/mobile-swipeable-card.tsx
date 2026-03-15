"use client";

import { useRef, useState, useCallback } from "react";

interface MobileSwipeableCardProps {
  children: React.ReactNode;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  leftLabel?: string;
  rightLabel?: string;
  leftActive?: boolean;
  rightActive?: boolean;
}

export function MobileSwipeableCard({
  children,
  onSwipeLeft,
  onSwipeRight,
  leftLabel = "Bookmark",
  rightLabel = "Ink",
  leftActive = false,
  rightActive = false,
}: MobileSwipeableCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchDelta = useRef(0);
  const isDragging = useRef(false);
  const isVertical = useRef(false);
  const [swipeDir, setSwipeDir] = useState<"left" | "right" | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchDelta.current = 0;
    isDragging.current = false;
    isVertical.current = false;
    setSwipeDir(null);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;

    // Determine scroll direction on first significant movement
    if (!isDragging.current && !isVertical.current) {
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
        isVertical.current = true;
        return;
      }
      if (Math.abs(dx) > 10) {
        isDragging.current = true;
      }
    }

    if (isVertical.current) return;
    if (!isDragging.current) return;

    touchDelta.current = dx;

    // Dampen the movement (feels more natural)
    const dampened = dx * 0.4;

    if (containerRef.current) {
      containerRef.current.style.transform = `translateX(${dampened}px)`;
      containerRef.current.style.transition = "none";
    }

    if (dx > 30) {
      setSwipeDir("right");
    } else if (dx < -30) {
      setSwipeDir("left");
    } else {
      setSwipeDir(null);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.style.transition = "transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)";
      containerRef.current.style.transform = "";
    }

    if (isDragging.current) {
      const threshold = 80;
      if (touchDelta.current > threshold && onSwipeRight) {
        onSwipeRight();
        try { navigator.vibrate?.(10); } catch { /* not supported */ }
      } else if (touchDelta.current < -threshold && onSwipeLeft) {
        onSwipeLeft();
        try { navigator.vibrate?.(10); } catch { /* not supported */ }
      }
    }

    isDragging.current = false;
    isVertical.current = false;
    setSwipeDir(null);
  }, [onSwipeLeft, onSwipeRight]);

  return (
    <div className="mobile-swipe-wrapper">
      {/* Action indicators behind card */}
      <div
        className={`mobile-swipe-action mobile-swipe-action--left ${swipeDir === "right" ? "mobile-swipe-action--visible" : ""}`}
        style={{ color: leftActive ? "var(--accent)" : undefined }}
      >
        {/* Bookmark icon */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill={leftActive ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
        <span>{leftLabel}</span>
      </div>
      <div
        className={`mobile-swipe-action mobile-swipe-action--right ${swipeDir === "left" ? "mobile-swipe-action--visible" : ""}`}
        style={{ color: rightActive ? "var(--accent)" : undefined }}
      >
        <span>{rightLabel}</span>
        {/* Ink drop icon */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill={rightActive ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.75">
          <path d="M12 2C12 2 5 10 5 14.5C5 18.09 8.13 21 12 21C15.87 21 19 18.09 19 14.5C19 10 12 2 12 2Z" />
        </svg>
      </div>

      {/* Card content */}
      <div
        ref={containerRef}
        className="mobile-swipe-card"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}
