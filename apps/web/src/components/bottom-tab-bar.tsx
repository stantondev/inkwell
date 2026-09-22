"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useLiveNavCounts } from "./live-nav-counts";
import { YouSheet } from "./you-sheet";
import { openJot } from "@/lib/stickies";

interface BottomTabBarProps {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  avatarFrame?: string | null;
  avatarAnimation?: string | null;
  subscriptionTier?: string;
  inkDonorStatus?: string | null;
  isAdmin?: boolean;
  selfHosted?: boolean;
  unreadNotificationCount?: number;
  unreadLetterCount?: number;
  draftCount?: number;
}

/**
 * Mobile tab bar: Feed · Explore · Write · Alerts · You.
 *
 * Write opens a small picker (entry or sticky) — mobile had no way to jot a
 * sticky before. You opens the menu sheet; everything that isn't a tab or in
 * the top bar lives there.
 */
export function BottomTabBar({
  username,
  displayName,
  avatarUrl,
  avatarFrame,
  avatarAnimation,
  subscriptionTier,
  inkDonorStatus,
  isAdmin,
  selfHosted,
  unreadNotificationCount: initialNotificationCount = 0,
  unreadLetterCount: initialLetterCount = 0,
  draftCount: initialDraftCount = 0,
}: BottomTabBarProps) {
  const pathname = usePathname();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [youOpen, setYouOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const composeRef = useRef<HTMLDivElement>(null);

  const { unreadNotificationCount, unreadLetterCount, draftCount } = useLiveNavCounts({
    draftCount: initialDraftCount,
    unreadNotificationCount: initialNotificationCount,
    unreadLetterCount: initialLetterCount,
  });

  // Hide the tab bar while the soft keyboard is open (visualViewport API)
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const handleResize = () => {
      setKeyboardVisible((vv.height ?? window.innerHeight) < window.innerHeight * 0.75);
    };
    vv.addEventListener("resize", handleResize);
    return () => vv.removeEventListener("resize", handleResize);
  }, []);

  // Close the Write picker on route change or a tap elsewhere
  useEffect(() => { setComposeOpen(false); }, [pathname]);
  useEffect(() => {
    if (!composeOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!composeRef.current?.contains(e.target as Node)) setComposeOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setComposeOpen(false); };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [composeOpen]);

  const isActive = useCallback((href: string) => {
    if (href === "/feed") return pathname === "/feed" || pathname === "/";
    if (href === "/explore") return pathname === "/explore" || pathname.startsWith("/explore/") || pathname.startsWith("/category/") || pathname.startsWith("/tag/");
    if (href === "/notifications") return pathname === "/notifications";
    return false;
  }, [pathname]);

  const onOwnProfile = pathname === `/${username}`;
  const closeYou = useCallback(() => setYouOpen(false), []);

  if (keyboardVisible) return null;

  return (
    <>
      <nav className="bottom-tab-bar" aria-label="Main navigation">
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

        {/* Write — raised centre button with an entry/sticky picker */}
        <div className="bottom-tab-compose" ref={composeRef}>
          {composeOpen && (
            <div className="bottom-tab-compose-menu" role="menu" aria-label="Write">
              <Link href="/editor" role="menuitem" className="bottom-tab-compose-option" onClick={() => setComposeOpen(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
                </svg>
                <span>
                  <span className="bottom-tab-compose-title">Journal entry</span>
                  <span className="bottom-tab-compose-sub">Title, words, pictures</span>
                </span>
              </Link>
              <button type="button" role="menuitem" className="bottom-tab-compose-option" onClick={() => { setComposeOpen(false); openJot(); }}>
                <span className="bottom-tab-compose-sticky" aria-hidden="true" />
                <span>
                  <span className="bottom-tab-compose-title">Jot a sticky</span>
                  <span className="bottom-tab-compose-sub">A quick thought, 500 characters</span>
                </span>
              </button>
            </div>
          )}
          <button
            type="button"
            className={`bottom-tab-fab${composeOpen ? " bottom-tab-fab--open" : ""}`}
            aria-label="Write"
            aria-haspopup="menu"
            aria-expanded={composeOpen}
            onClick={() => setComposeOpen((v) => !v)}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="bottom-tab-fab-pen">
              <path d="M12 19l7-7 3 3-7 7-3-3z" />
              <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
              <path d="M2 2l7.586 7.586" />
              <circle cx="11" cy="11" r="2" fill="#fff" stroke="none" />
            </svg>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true" className="bottom-tab-fab-close">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <TabItem href="/notifications" label="Alerts" active={isActive("/notifications")} badge={unreadNotificationCount}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </TabItem>

        {/* You — opens the menu sheet */}
        <button
          type="button"
          className={`bottom-tab-item ${youOpen || onOwnProfile ? "bottom-tab-item--active" : ""}`}
          aria-haspopup="dialog"
          aria-expanded={youOpen}
          onClick={() => setYouOpen(true)}
        >
          <span className="bottom-tab-icon-wrap">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="bottom-tab-avatar" />
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
              </svg>
            )}
          </span>
          <span className="bottom-tab-label">You</span>
        </button>
      </nav>

      {youOpen && (
        <YouSheet
          username={username}
          displayName={displayName}
          avatarUrl={avatarUrl}
          avatarFrame={avatarFrame}
          avatarAnimation={avatarAnimation}
          subscriptionTier={subscriptionTier}
          inkDonorStatus={inkDonorStatus}
          isAdmin={isAdmin}
          selfHosted={selfHosted}
          unreadLetterCount={unreadLetterCount}
          draftCount={draftCount}
          onClose={closeYou}
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
      aria-current={active ? "page" : undefined}
    >
      <span className="bottom-tab-icon-wrap">
        {children}
        {badge != null && badge > 0 && (
          <span className="bottom-tab-badge" aria-label={`${badge} unread`}>
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </span>
      <span className="bottom-tab-label">{label}</span>
    </Link>
  );
}
