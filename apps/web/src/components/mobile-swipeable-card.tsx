"use client";

import { useRef, useState, useCallback } from "react";

interface MobileSwipeableCardProps {
  children: React.ReactNode;
  /** Called when user swipes up past threshold */
  onSwipeUp?: () => void;
  /** Called when user swipes down past threshold */
  onSwipeDown?: () => void;
  /** Label for swipe-up action */
  upLabel?: string;
  /** Label for swipe-down action */
  downLabel?: string;
  /** Whether the up action is already active (e.g. already inked) */
  upActive?: boolean;
  /** Whether the down action is already active (e.g. already bookmarked) */
  downActive?: boolean;
}

export function MobileSwipeableCard({
  children,
  onSwipeUp,
  onSwipeDown,
  upLabel = "Ink",
  downLabel = "Bookmark",
  upActive = false,
  downActive = false,
}: MobileSwipeableCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchDeltaY = useRef(0);
  const isDragging = useRef(false);
  const isHorizontal = useRef(false);
  const directionLocked = useRef(false);
  const [swipeDir, setSwipeDir] = useState<"up" | "down" | null>(null);
  const [swipeProgress, setSwipeProgress] = useState(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Check if the touch is inside a scrollable container that has room to scroll
    const target = e.target as HTMLElement;
    const scrollable = target.closest(".journal-book-entry-body");
    if (scrollable) {
      const el = scrollable as HTMLElement;
      const canScrollUp = el.scrollTop > 0;
      const canScrollDown = el.scrollTop < el.scrollHeight - el.clientHeight - 2;
      // If content is scrollable in the direction of the gesture, don't intercept
      if (canScrollUp || canScrollDown) {
        // We'll check direction in touchMove
      }
    }

    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchDeltaY.current = 0;
    isDragging.current = false;
    isHorizontal.current = false;
    directionLocked.current = false;
    setSwipeDir(null);
    setSwipeProgress(0);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;

    // Lock direction on first significant movement
    if (!directionLocked.current) {
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) {
        // Horizontal movement — let the scroll-snap container handle it
        isHorizontal.current = true;
        directionLocked.current = true;
        return;
      }
      if (Math.abs(dy) > 8) {
        // Check if content inside is scrollable in this direction
        const target = e.target as HTMLElement;
        const scrollable = target.closest(".journal-book-entry-body");
        if (scrollable) {
          const el = scrollable as HTMLElement;
          const atTop = el.scrollTop <= 0;
          const atBottom = el.scrollTop >= el.scrollHeight - el.clientHeight - 2;

          // If swiping up but content can scroll up, let it scroll
          if (dy > 0 && !atTop) {
            isHorizontal.current = true; // Not horizontal, but let it pass through
            directionLocked.current = true;
            return;
          }
          // If swiping down but content can scroll down
          if (dy < 0 && !atBottom) {
            isHorizontal.current = true;
            directionLocked.current = true;
            return;
          }
        }

        isDragging.current = true;
        directionLocked.current = true;
      }
    }

    if (isHorizontal.current) return;
    if (!isDragging.current) return;

    touchDeltaY.current = dy;

    // Dampen the movement
    const dampened = dy * 0.35;
    const absDampened = Math.abs(dampened);
    const threshold = 60;

    if (containerRef.current) {
      containerRef.current.style.transform = `translateY(${dampened}px)`;
      containerRef.current.style.transition = "none";
    }

    setSwipeProgress(Math.min(absDampened / threshold, 1));

    if (dy < -30) {
      setSwipeDir("up");
    } else if (dy > 30) {
      setSwipeDir("down");
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
      const threshold = 60;
      if (touchDeltaY.current < -threshold && onSwipeUp) {
        onSwipeUp();
        try { navigator.vibrate?.(10); } catch { /* not supported */ }
      } else if (touchDeltaY.current > threshold && onSwipeDown) {
        onSwipeDown();
        try { navigator.vibrate?.(10); } catch { /* not supported */ }
      }
    }

    isDragging.current = false;
    isHorizontal.current = false;
    directionLocked.current = false;
    setSwipeDir(null);
    setSwipeProgress(0);
  }, [onSwipeUp, onSwipeDown]);

  return (
    <div className="mobile-swipe-wrapper-v">
      {/* Swipe UP indicator (ink) — appears at bottom, slides up */}
      <div
        className={`mobile-swipe-indicator mobile-swipe-indicator--up ${swipeDir === "up" ? "mobile-swipe-indicator--visible" : ""}`}
        style={{
          color: upActive ? "var(--accent)" : "var(--foreground)",
          opacity: swipeDir === "up" ? Math.max(0.4, swipeProgress) : 0,
        }}
      >
        <svg width="24" height="28" viewBox="0 0 16 20" fill={upActive ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.25">
          <path d="M8 1C8 1 1 8.5 1 12.5a7 7 0 0 0 14 0C15 8.5 8 1 8 1Z" />
        </svg>
        <span className="text-xs font-medium">{upActive ? "Inked" : upLabel}</span>
      </div>

      {/* Swipe DOWN indicator (bookmark) — appears at top, slides down */}
      <div
        className={`mobile-swipe-indicator mobile-swipe-indicator--down ${swipeDir === "down" ? "mobile-swipe-indicator--visible" : ""}`}
        style={{
          color: downActive ? "var(--accent)" : "var(--foreground)",
          opacity: swipeDir === "down" ? Math.max(0.4, swipeProgress) : 0,
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill={downActive ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
        <span className="text-xs font-medium">{downActive ? "Saved" : downLabel}</span>
      </div>

      {/* Card content */}
      <div
        ref={containerRef}
        className="mobile-swipe-card-v"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}
