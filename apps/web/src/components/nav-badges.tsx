"use client";

import Link from "next/link";
import { useLiveNavCounts } from "./live-nav-counts";

/**
 * Client wrapper for nav badges that stay fresh during client-side navigation.
 * Replaces the static server-rendered counts with live-updating ones.
 */
export function NavBadges({
  initialDraftCount,
  initialNotificationCount,
  initialLetterCount,
}: {
  initialDraftCount: number;
  initialNotificationCount: number;
  initialLetterCount: number;
}) {
  const { draftCount, unreadNotificationCount, unreadLetterCount } = useLiveNavCounts({
    draftCount: initialDraftCount,
    unreadNotificationCount: initialNotificationCount,
    unreadLetterCount: initialLetterCount,
  });

  return (
    <>
      {/* Drafts link + badge */}
      <Link
        href="/drafts"
        className="hidden sm:inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
        style={{ color: "var(--muted)" }}
      >
        Drafts
        {draftCount > 0 && (
          <span
            className="rounded-full text-xs px-1.5 py-0.5"
            style={{ background: "var(--surface-hover)", color: "var(--foreground)" }}
          >
            {draftCount}
          </span>
        )}
      </Link>

      {/* Letters (envelope icon) */}
      <Link
        href="/letters"
        className="hidden sm:flex items-center justify-center w-8 h-8 rounded-full transition-colors hover:bg-[var(--surface-hover)] relative"
        aria-label={`Letterbox${unreadLetterCount > 0 ? ` (${unreadLetterCount} unread)` : ""}`}
      >
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
        >
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
          <polyline points="22,6 12,13 2,6" />
        </svg>
        {unreadLetterCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 flex items-center justify-center rounded-full text-white font-bold"
            style={{
              background: "var(--danger)",
              fontSize: "9px",
              minWidth: "16px",
              height: "16px",
              padding: "0 4px",
              lineHeight: 1,
            }}
          >
            {unreadLetterCount > 9 ? "9+" : unreadLetterCount}
          </span>
        )}
      </Link>

      {/* Notifications (bell icon) */}
      <Link
        href="/notifications"
        className="hidden sm:flex items-center justify-center w-8 h-8 rounded-full transition-colors hover:bg-[var(--surface-hover)] relative"
        aria-label={`Notifications${unreadNotificationCount > 0 ? ` (${unreadNotificationCount} unread)` : ""}`}
      >
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadNotificationCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 flex items-center justify-center rounded-full text-white font-bold"
            style={{
              background: "var(--danger)",
              fontSize: "9px",
              minWidth: "16px",
              height: "16px",
              padding: "0 4px",
              lineHeight: 1,
            }}
          >
            {unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}
          </span>
        )}
      </Link>
    </>
  );
}
