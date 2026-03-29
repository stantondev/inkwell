"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useLiveNavCounts } from "./live-nav-counts";
import { BookSpineDrawer } from "./book-spine-drawer";

const TOP_LEVEL_PATHS = new Set([
  "/", "/feed", "/explore", "/editor", "/notifications",
  "/letters", "/saved", "/circles", "/polls", "/roadmap",
  "/pen-pals", "/drafts",
]);

function getFallbackRoute(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === "admin") return "/admin";
  if (segments[0] === "settings") return "/settings";
  if (segments[0] === "circles" && segments.length >= 3) return `/circles/${segments[1]}`;
  if (segments[0] === "circles" && segments.length === 2) return "/circles";
  if (segments[0] === "polls" && segments.length >= 2) return "/polls";
  if (segments[0] === "roadmap" && segments.length >= 2) return "/roadmap";
  if (segments.length === 2) return "/feed";
  if (segments.length === 1) return "/explore";
  return "/feed";
}

interface MobileTopBarProps {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  avatarFrame?: string | null;
  avatarAnimation?: string | null;
  subscriptionTier?: string;
  inkDonorStatus?: string | null;
  isAdmin?: boolean;
  unreadLetterCount?: number;
  unreadNotificationCount?: number;
  draftCount?: number;
  selfHosted?: boolean;
}

export function MobileTopBar({
  username,
  displayName,
  avatarUrl,
  avatarFrame,
  avatarAnimation,
  subscriptionTier,
  inkDonorStatus,
  isAdmin,
  unreadLetterCount: initialLetterCount = 0,
  unreadNotificationCount: initialNotificationCount = 0,
  draftCount: initialDraftCount = 0,
  selfHosted,
}: MobileTopBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const navDepth = useRef(0);
  const initialPath = useRef(pathname);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { unreadLetterCount, draftCount } = useLiveNavCounts({
    draftCount: initialDraftCount,
    unreadNotificationCount: initialNotificationCount,
    unreadLetterCount: initialLetterCount,
  });

  // Track navigation depth for back button
  useEffect(() => {
    if (pathname !== initialPath.current) {
      navDepth.current++;
    }
  }, [pathname]);

  const isDeepPage = !TOP_LEVEL_PATHS.has(pathname);

  const handleBack = () => {
    if (navDepth.current > 0) {
      router.back();
    } else {
      router.push(getFallbackRoute(pathname));
    }
  };

  const handleHamburger = () => {
    setDrawerOpen(true);
  };

  // Edge swipe to open drawer — touch starting within 24px of left edge
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let tracking = false;

    const onTouchStart = (e: TouchEvent) => {
      if (drawerOpen) return;
      const touch = e.touches[0];
      if (touch.clientX < 24) {
        startX = touch.clientX;
        startY = touch.clientY;
        tracking = true;
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - startX;
      const deltaY = Math.abs(touch.clientY - startY);
      // Must swipe right at least 60px, and more horizontal than vertical
      if (deltaX > 60 && deltaX > deltaY) {
        setDrawerOpen(true);
      }
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [drawerOpen]);

  return (
    <>
      <header className="mobile-top-bar">
        {/* Left: hamburger or back button */}
        <div className="mobile-top-bar-left">
          {isDeepPage ? (
            <button
              className="mobile-top-bar-btn"
              onClick={handleBack}
              aria-label="Go back"
              type="button"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          ) : (
            <button
              className="mobile-top-bar-btn"
              onClick={handleHamburger}
              aria-label="Open navigation menu"
              type="button"
            >
              {/* Book spine hamburger — three lines with slight variation */}
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="18" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {/* Center: logo */}
        <div className="mobile-top-bar-center">
          <Link href="/feed" aria-label="Inkwell home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/inkwell-logo.svg"
              alt="Inkwell"
              className="mobile-top-bar-logo dark:brightness-0 dark:invert"
            />
          </Link>
        </div>

        {/* Right: letters + search */}
        <div className="mobile-top-bar-right">
          <Link href="/letters" className="mobile-top-bar-btn" aria-label="Letters">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            {unreadLetterCount > 0 && (
              <span className="mobile-top-bar-badge" aria-label={`${unreadLetterCount} unread letters`}>
                {unreadLetterCount > 9 ? "9+" : unreadLetterCount}
              </span>
            )}
          </Link>
          <Link href="/explore" className="mobile-top-bar-btn" aria-label="Search">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </Link>
        </div>
      </header>

      {/* Book Spine Drawer */}
      {drawerOpen && (
        <BookSpineDrawer
          username={username}
          displayName={displayName}
          avatarUrl={avatarUrl}
          avatarFrame={avatarFrame}
          avatarAnimation={avatarAnimation}
          subscriptionTier={subscriptionTier}
          inkDonorStatus={inkDonorStatus}
          isAdmin={isAdmin}
          unreadLetterCount={unreadLetterCount}
          draftCount={draftCount}
          selfHosted={selfHosted}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </>
  );
}
