"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useLiveNavCounts } from "./live-nav-counts";

// Pages reached from the tab bar or the You sheet: no back button, the logo sits alone.
const TOP_LEVEL_PATHS = new Set([
  "/", "/feed", "/explore", "/editor", "/notifications",
  "/letters", "/saved", "/circles", "/polls", "/roadmap",
  "/pen-pals", "/drafts", "/manage", "/readers", "/gazette",
  "/settings", "/help",
]);

function getFallbackRoute(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === "admin") return "/admin";
  if (segments[0] === "settings") return "/settings";
  if (segments[0] === "circles" && segments.length >= 3) return `/circles/${segments[1]}`;
  if (segments[0] === "circles" && segments.length === 2) return "/circles";
  if (segments[0] === "polls" && segments.length >= 2) return "/polls";
  if (segments[0] === "roadmap" && segments.length >= 2) return "/roadmap";
  if (segments[0] === "help" && segments.length >= 2) return "/help";
  if (segments[0] === "letters" && segments.length >= 2) return "/letters";
  if (segments.length === 2) return `/${segments[0]}`;
  if (segments.length === 1) return "/explore";
  return "/feed";
}

interface MobileTopBarProps {
  username: string;
  unreadLetterCount?: number;
  unreadNotificationCount?: number;
  draftCount?: number;
}

/**
 * Mobile header: back (on inner pages) · logo · Letters · Search.
 *
 * The hamburger and its drawer are gone (2026-09-22); the rest of the app is
 * one tap away under the You tab. So is the left-edge swipe that opened the
 * drawer, which collided with iOS's own swipe-back.
 */
export function MobileTopBar({
  username,
  unreadLetterCount: initialLetterCount = 0,
  unreadNotificationCount: initialNotificationCount = 0,
  draftCount: initialDraftCount = 0,
}: MobileTopBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const navDepth = useRef(0);
  const initialPath = useRef(pathname);
  const [online, setOnline] = useState(true);

  const { unreadLetterCount } = useLiveNavCounts({
    draftCount: initialDraftCount,
    unreadNotificationCount: initialNotificationCount,
    unreadLetterCount: initialLetterCount,
  });

  useEffect(() => {
    if (pathname !== initialPath.current) navDepth.current++;
  }, [pathname]);

  // Connection notice (read after mount; the server always thinks it's online)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const isDeepPage = !TOP_LEVEL_PATHS.has(pathname) && pathname !== `/${username}`;

  const handleBack = () => {
    if (navDepth.current > 0) router.back();
    else router.push(getFallbackRoute(pathname));
  };

  return (
    <>
      <header className="mobile-top-bar">
        <div className="mobile-top-bar-left">
          {isDeepPage && (
            <button className="mobile-top-bar-btn" onClick={handleBack} aria-label="Go back" type="button">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          )}
        </div>

        <div className="mobile-top-bar-center">
          <Link href="/feed" aria-label="Inkwell home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/inkwell-logo.svg" alt="Inkwell" className="mobile-top-bar-logo dark:brightness-0 dark:invert" />
          </Link>
        </div>

        <div className="mobile-top-bar-right">
          <Link href="/letters" className="mobile-top-bar-btn" aria-label={unreadLetterCount > 0 ? `Letters, ${unreadLetterCount} unread` : "Letters"}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            {unreadLetterCount > 0 && (
              <span className="mobile-top-bar-badge" aria-hidden="true">
                {unreadLetterCount > 9 ? "9+" : unreadLetterCount}
              </span>
            )}
          </Link>
          <Link href="/explore?focus=search" className="mobile-top-bar-btn" aria-label="Search">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </Link>
        </div>
      </header>

      {!online && (
        <div className="mobile-offline-notice" role="status">
          You&apos;re offline. Inkwell will pick up again when your connection is back.
        </div>
      )}
    </>
  );
}
