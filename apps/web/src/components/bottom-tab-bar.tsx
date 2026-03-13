"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useLiveNavCounts } from "./live-nav-counts";
import { MoreSheet } from "./more-sheet";

interface BottomTabBarProps {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  avatarFrame?: string | null;
  subscriptionTier?: string;
  isAdmin?: boolean;
  unreadNotificationCount?: number;
  unreadLetterCount?: number;
  draftCount?: number;
  selfHosted?: boolean;
}

export function BottomTabBar({
  username,
  displayName,
  avatarUrl,
  avatarFrame,
  subscriptionTier,
  isAdmin,
  unreadNotificationCount: initialNotificationCount = 0,
  unreadLetterCount: initialLetterCount = 0,
  draftCount: initialDraftCount = 0,
  selfHosted,
}: BottomTabBarProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const { draftCount, unreadNotificationCount, unreadLetterCount } = useLiveNavCounts({
    draftCount: initialDraftCount,
    unreadNotificationCount: initialNotificationCount,
    unreadLetterCount: initialLetterCount,
  });

  const alertsBadge = unreadNotificationCount + unreadLetterCount;

  // Hide tab bar when soft keyboard is open (visualViewport API)
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const threshold = window.innerHeight * 0.75;
    const handleResize = () => {
      setKeyboardVisible((vv.height ?? window.innerHeight) < threshold);
    };

    vv.addEventListener("resize", handleResize);
    return () => vv.removeEventListener("resize", handleResize);
  }, []);

  // Active tab detection
  const isActive = useCallback((href: string) => {
    if (href === "/feed") return pathname === "/feed" || pathname === "/";
    if (href === "/explore") return pathname === "/explore" || pathname.startsWith("/explore/") || pathname.startsWith("/category/") || pathname.startsWith("/tag/");
    if (href === "/editor") return pathname === "/editor";
    if (href === "/notifications") return pathname === "/notifications" || pathname === "/letters";
    return false;
  }, [pathname]);

  // Check if More should show as active (any secondary page)
  const isMoreActive = !isActive("/feed") && !isActive("/explore") && !isActive("/editor") && !isActive("/notifications");

  if (keyboardVisible) return null;

  return (
    <>
      <nav className="bottom-tab-bar" role="tablist" aria-label="Main navigation">
        {/* Paper texture overlay */}
        <svg className="bottom-tab-texture" aria-hidden="true">
          <filter id="btb-paper">
            <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="5" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#btb-paper)" opacity="0.03" />
        </svg>

        <TabItem href="/feed" label="Feed" active={isActive("/feed")}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 11a9 9 0 0 1 9 9" /><path d="M4 4a16 16 0 0 1 16 16" /><circle cx="5" cy="19" r="1" />
          </svg>
        </TabItem>

        <TabItem href="/explore" label="Explore" active={isActive("/explore")}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
          </svg>
        </TabItem>

        {/* Write FAB — raised center button */}
        <Link
          href="/editor"
          className="bottom-tab-fab"
          aria-label="Write new entry"
          role="tab"
          aria-selected={isActive("/editor")}
        >
          {/* Pen nib icon */}
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M12 19l7-7 3 3-7 7-3-3z" />
            <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
            <path d="M2 2l7.586 7.586" />
            <circle cx="11" cy="11" r="2" fill="#fff" stroke="none" />
          </svg>
        </Link>

        <TabItem href="/notifications" label="Alerts" active={isActive("/notifications")} badge={alertsBadge}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </TabItem>

        <button
          className={`bottom-tab-item ${isMoreActive && !moreOpen ? "bottom-tab-item--active" : ""}`}
          onClick={() => setMoreOpen(true)}
          role="tab"
          aria-label="More navigation"
          aria-expanded={moreOpen}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
          </svg>
          <span className="bottom-tab-label">More</span>
        </button>
      </nav>

      {moreOpen && (
        <MoreSheet
          username={username}
          displayName={displayName}
          avatarUrl={avatarUrl}
          avatarFrame={avatarFrame}
          subscriptionTier={subscriptionTier}
          isAdmin={isAdmin}
          unreadLetterCount={unreadLetterCount}
          draftCount={draftCount}
          selfHosted={selfHosted}
          onClose={() => setMoreOpen(false)}
        />
      )}
    </>
  );
}

function TabItem({
  href,
  label,
  active,
  badge,
  children,
}: {
  href: string;
  label: string;
  active: boolean;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`bottom-tab-item ${active ? "bottom-tab-item--active" : ""}`}
      role="tab"
      aria-selected={active}
    >
      <span className="bottom-tab-icon-wrap">
        {children}
        {badge != null && badge > 0 && (
          <span className="bottom-tab-badge">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </span>
      <span className="bottom-tab-label">{label}</span>
    </Link>
  );
}
