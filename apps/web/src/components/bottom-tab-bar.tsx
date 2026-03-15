"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useLiveNavCounts } from "./live-nav-counts";

interface BottomTabBarProps {
  username: string;
  avatarUrl: string | null;
  unreadNotificationCount?: number;
  unreadLetterCount?: number;
  draftCount?: number;
}

export function BottomTabBar({
  username,
  avatarUrl,
  unreadNotificationCount: initialNotificationCount = 0,
  unreadLetterCount: initialLetterCount = 0,
  draftCount: initialDraftCount = 0,
}: BottomTabBarProps) {
  const pathname = usePathname();
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const { unreadNotificationCount } = useLiveNavCounts({
    draftCount: initialDraftCount,
    unreadNotificationCount: initialNotificationCount,
    unreadLetterCount: initialLetterCount,
  });

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
    if (href === "/notifications") return pathname === "/notifications";
    if (href === `/${username}`) return pathname === `/${username}`;
    return false;
  }, [pathname, username]);

  if (keyboardVisible) return null;

  return (
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

      <TabItem href="/notifications" label="Alerts" active={isActive("/notifications")} badge={unreadNotificationCount}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      </TabItem>

      {/* Profile tab — user avatar or fallback icon */}
      <Link
        href={`/${username}`}
        className={`bottom-tab-item ${isActive(`/${username}`) ? "bottom-tab-item--active" : ""}`}
        role="tab"
        aria-selected={isActive(`/${username}`)}
      >
        <span className="bottom-tab-icon-wrap">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              className="bottom-tab-avatar"
            />
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
          )}
        </span>
        <span className="bottom-tab-label">Profile</span>
      </Link>
    </nav>
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
