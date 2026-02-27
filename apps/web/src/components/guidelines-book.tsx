"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { GUIDELINES_PAGES } from "@/lib/community-guidelines";

const TOTAL_PAGES = GUIDELINES_PAGES.length; // 8

interface GuidelinesBookProps {
  onAgree: () => void;
}

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    setIsDesktop(mq.matches);
    setMounted(true);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return { isDesktop, mounted };
}

export function GuidelinesBook({ onAgree }: GuidelinesBookProps) {
  const { isDesktop, mounted } = useIsDesktop();
  const prefersReducedMotion = usePrefersReducedMotion();

  // currentPage is always a 0-indexed page number.
  // On desktop, we show pages in pairs (spreads): 0-1, 2-3, 4-5, 6-7
  // On mobile, we show one page at a time.
  const [currentPage, setCurrentPage] = useState(0);
  const [direction, setDirection] = useState(0); // -1 back, +1 forward
  const [hasReadAll, setHasReadAll] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  // Swipe tracking
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // On desktop, the "effective page" snaps to even numbers (spread starts)
  const effectivePage = isDesktop ? Math.floor(currentPage / 2) * 2 : currentPage;
  const totalStops = isDesktop ? Math.ceil(TOTAL_PAGES / 2) : TOTAL_PAGES;
  const currentStop = isDesktop ? effectivePage / 2 : currentPage;
  const lastStop = totalStops - 1;

  // Track if user has reached the last spread/page
  useEffect(() => {
    if (currentStop >= lastStop) {
      setHasReadAll(true);
    }
  }, [currentStop, lastStop]);

  const goForward = useCallback(() => {
    if (isAnimating) return;
    const step = isDesktop ? 2 : 1;
    const nextPage = Math.min(currentPage + step, isDesktop ? (totalStops - 1) * 2 : TOTAL_PAGES - 1);
    if (nextPage !== currentPage) {
      setDirection(1);
      setCurrentPage(nextPage);
    }
  }, [currentPage, isDesktop, totalStops, isAnimating]);

  const goBack = useCallback(() => {
    if (isAnimating) return;
    const step = isDesktop ? 2 : 1;
    const prevPage = Math.max(currentPage - step, 0);
    if (prevPage !== currentPage) {
      setDirection(-1);
      setCurrentPage(prevPage);
    }
  }, [currentPage, isDesktop, isAnimating]);

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goForward();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goBack();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [goForward, goBack]);

  // Swipe gestures
  function handleTouchStart(e: React.TouchEvent) {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (!touchStartRef.current) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    // Only trigger if horizontal movement is dominant and significant
    if (Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 50) {
      if (dx < 0) goForward();
      else goBack();
    }
  }

  // Animation variants
  const desktopVariants = {
    enter: (dir: number) => ({
      rotateY: dir > 0 ? 8 : -8,
      opacity: 0,
      scale: 0.97,
    }),
    center: {
      rotateY: 0,
      opacity: 1,
      scale: 1,
    },
    exit: (dir: number) => ({
      rotateY: dir > 0 ? -8 : 8,
      opacity: 0,
      scale: 0.97,
    }),
  };

  const mobileVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 200 : -200,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      x: dir > 0 ? -200 : 200,
      opacity: 0,
    }),
  };

  const canGoBack = currentStop > 0;
  const canGoForward = currentStop < lastStop;

  // Wait for client-side mount to avoid SSR hydration mismatch
  if (!mounted) {
    return (
      <div className="guidelines-book-wrapper" style={{ minHeight: 420, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--muted)", fontStyle: "italic", fontSize: "0.875rem" }}>Loading guidelines...</p>
      </div>
    );
  }

  // Render a single page
  function renderPage(pageIndex: number, side: "left" | "right" | "single") {
    const page = GUIDELINES_PAGES[pageIndex];
    if (!page) return null;

    const isLeft = side === "left";
    const isRight = side === "right";

    return (
      <div
        className={`guidelines-book-page ${
          isLeft ? "guidelines-book-page-left" : isRight ? "guidelines-book-page-right" : "guidelines-book-page-single"
        }`}
      >
        {/* Paper texture overlay */}
        <div className="guidelines-book-paper-texture" />

        <div className="guidelines-book-page-content">
          <h3 className="guidelines-book-page-title">{page.title}</h3>

          <div className="guidelines-book-ornament" aria-hidden="true">
            &middot; &middot; &middot;
          </div>

          <div className="guidelines-book-page-body">
            {page.body.map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </div>
        </div>

        <div className="guidelines-book-page-number">
          &mdash; {pageIndex + 1} &mdash;
        </div>
      </div>
    );
  }

  return (
    <div className="guidelines-book-wrapper">
      {/* Navigation arrows */}
      <div className="guidelines-book-nav">
        <button
          type="button"
          onClick={goBack}
          disabled={!canGoBack || isAnimating}
          className="guidelines-book-nav-btn"
          aria-label="Previous page"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        {/* The Book */}
        <div
          className="guidelines-book-container"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          style={{ perspective: isDesktop ? 1200 : undefined }}
        >
          <AnimatePresence
            mode="wait"
            custom={direction}
            initial={false}
            onExitComplete={() => setIsAnimating(false)}
          >
            {isDesktop ? (
              // Desktop: two-page spread
              <motion.div
                key={`spread-${effectivePage}`}
                className="guidelines-book-spread"
                custom={direction}
                variants={prefersReducedMotion ? undefined : desktopVariants}
                initial={prefersReducedMotion ? false : "enter"}
                animate="center"
                exit={prefersReducedMotion ? undefined : "exit"}
                transition={
                  prefersReducedMotion
                    ? { duration: 0 }
                    : { duration: 0.45, ease: [0.4, 0, 0.2, 1] }
                }
                onAnimationStart={() => setIsAnimating(true)}
                onAnimationComplete={() => setIsAnimating(false)}
                style={{ transformStyle: "preserve-3d" }}
              >
                {renderPage(effectivePage, "left")}
                <div className="guidelines-book-spine" />
                {effectivePage + 1 < TOTAL_PAGES
                  ? renderPage(effectivePage + 1, "right")
                  : <div className="guidelines-book-page guidelines-book-page-right guidelines-book-page-empty" />
                }
              </motion.div>
            ) : (
              // Mobile: single page
              <motion.div
                key={`page-${currentPage}`}
                className="guidelines-book-single"
                custom={direction}
                variants={prefersReducedMotion ? undefined : mobileVariants}
                initial={prefersReducedMotion ? false : "enter"}
                animate="center"
                exit={prefersReducedMotion ? undefined : "exit"}
                transition={
                  prefersReducedMotion
                    ? { duration: 0 }
                    : { duration: 0.3, ease: [0.4, 0, 0.2, 1] }
                }
                onAnimationStart={() => setIsAnimating(true)}
                onAnimationComplete={() => setIsAnimating(false)}
              >
                {renderPage(currentPage, "single")}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Stacked page edge effect (desktop only) */}
          {isDesktop && <div className="guidelines-book-edge" />}
        </div>

        <button
          type="button"
          onClick={goForward}
          disabled={!canGoForward || isAnimating}
          className="guidelines-book-nav-btn"
          aria-label="Next page"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      {/* Page indicator */}
      <div className="guidelines-book-indicator">
        {Array.from({ length: totalStops }, (_, i) => (
          <div
            key={i}
            className={`guidelines-book-dot ${i === currentStop ? "active" : ""} ${i < currentStop ? "visited" : ""}`}
          />
        ))}
      </div>

      {/* Page counter */}
      <p className="guidelines-book-counter">
        {isDesktop
          ? `Pages ${effectivePage + 1}\u2013${Math.min(effectivePage + 2, TOTAL_PAGES)} of ${TOTAL_PAGES}`
          : `Page ${currentPage + 1} of ${TOTAL_PAGES}`
        }
      </p>

      {/* Agree button */}
      <div className="guidelines-book-agree">
        {hasReadAll ? (
          <button
            type="button"
            onClick={onAgree}
            className="guidelines-book-agree-btn enabled"
          >
            I agree to these guidelines
          </button>
        ) : (
          <div className="guidelines-book-agree-hint">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <span>Read through all pages to continue</span>
          </div>
        )}
      </div>
    </div>
  );
}
