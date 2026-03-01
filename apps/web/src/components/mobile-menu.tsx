"use client";

import { useState } from "react";
import Link from "next/link";
import { useLiveNavCounts } from "./live-nav-counts";

interface MobileMenuProps {
  username: string;
  subscriptionTier?: string;
  isAdmin?: boolean;
  unreadNotificationCount?: number;
  unreadLetterCount?: number;
  draftCount?: number;
}

export function MobileMenu({ username, subscriptionTier, isAdmin, unreadNotificationCount: initialNotificationCount = 0, unreadLetterCount: initialLetterCount = 0, draftCount: initialDraftCount = 0 }: MobileMenuProps) {
  const [open, setOpen] = useState(false);

  const { draftCount, unreadNotificationCount, unreadLetterCount } = useLiveNavCounts({
    draftCount: initialDraftCount,
    unreadNotificationCount: initialNotificationCount,
    unreadLetterCount: initialLetterCount,
  });

  return (
    <div className="sm:hidden">
      {/* Hamburger button */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-center w-8 h-8 rounded-full transition-colors relative"
        style={{ color: "var(--muted)" }}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
      >
        {/* Unread dot on hamburger (notifications or letters) */}
        {!open && (unreadNotificationCount > 0 || unreadLetterCount > 0) && (
          <span
            className="absolute top-0 right-0 rounded-full"
            style={{ background: "var(--danger)", width: 8, height: 8 }}
          />
        )}
        {open ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6L6 18" /><path d="M6 6l12 12" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M3 12h18" /><path d="M3 6h18" /><path d="M3 18h18" />
          </svg>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          className="absolute left-0 right-0 top-full border-b z-50 px-4 py-3"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <div className="flex flex-col gap-1 max-w-5xl mx-auto">
            <MobileLink href="/feed" onClick={() => setOpen(false)}>
              <FeedIcon /> Feed
            </MobileLink>
            <MobileLink href="/explore" onClick={() => setOpen(false)}>
              <ExploreIcon /> Explore
            </MobileLink>
            <MobileLink href="/pen-pals" onClick={() => setOpen(false)}>
              <PenPalsIcon /> Pen Pals
            </MobileLink>
            <MobileLink href="/saved" onClick={() => setOpen(false)}>
              <SavedIcon /> Bookmarks
            </MobileLink>
            <MobileLink href="/editor" onClick={() => setOpen(false)}>
              <WriteIcon /> Write
            </MobileLink>
            <MobileLink href="/drafts" onClick={() => setOpen(false)}>
              <DraftsIcon /> Drafts
              {draftCount > 0 && (
                <span
                  className="ml-auto rounded-full text-xs font-medium flex items-center justify-center"
                  style={{
                    background: "var(--surface-hover)",
                    color: "var(--foreground)",
                    minWidth: "18px",
                    height: "18px",
                    padding: "0 5px",
                    lineHeight: 1,
                  }}
                >
                  {draftCount}
                </span>
              )}
            </MobileLink>
            <MobileLink href="/notifications" onClick={() => setOpen(false)}>
              <NotificationsIcon /> Notifications
              {unreadNotificationCount > 0 && (
                <span
                  className="ml-auto rounded-full text-white font-bold flex items-center justify-center"
                  style={{
                    background: "var(--danger)",
                    fontSize: "10px",
                    minWidth: "18px",
                    height: "18px",
                    padding: "0 5px",
                    lineHeight: 1,
                  }}
                >
                  {unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}
                </span>
              )}
            </MobileLink>
            <MobileLink href="/letters" onClick={() => setOpen(false)}>
              <LettersIcon /> Letterbox
              {unreadLetterCount > 0 && (
                <span
                  className="ml-auto rounded-full text-white font-bold flex items-center justify-center"
                  style={{
                    background: "var(--danger)",
                    fontSize: "10px",
                    minWidth: "18px",
                    height: "18px",
                    padding: "0 5px",
                    lineHeight: 1,
                  }}
                >
                  {unreadLetterCount > 9 ? "9+" : unreadLetterCount}
                </span>
              )}
            </MobileLink>
            <MobileLink href="/search" onClick={() => setOpen(false)}>
              <SearchIcon /> Search
            </MobileLink>

            <div className="border-t my-1" style={{ borderColor: "var(--border)" }} />

            <MobileLink href={`/${username}`} onClick={() => setOpen(false)}>
              <ProfileIcon /> Profile
            </MobileLink>
            <MobileLink href="/settings" onClick={() => setOpen(false)}>
              <SettingsIcon /> Settings
            </MobileLink>
            <MobileLink href="/roadmap" onClick={() => setOpen(false)}>
              <FeedbackIcon /> Roadmap
            </MobileLink>
            <MobileLink href="/roadmap/new" onClick={() => setOpen(false)}>
              <SubmitFeedbackIcon /> Submit Feedback
            </MobileLink>
            <MobileLink href="/settings/invite" onClick={() => setOpen(false)}>
              <InviteIcon /> Invite Friends
            </MobileLink>

            {subscriptionTier !== "plus" && (
              <MobileLink href="/settings/billing" onClick={() => setOpen(false)} accent>
                <span style={{ color: "var(--accent)" }}>✦</span> Upgrade to Plus
              </MobileLink>
            )}

            {isAdmin && (
              <MobileLink href="/admin" onClick={() => setOpen(false)}>
                <AdminIcon /> Admin
              </MobileLink>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MobileLink({
  href, onClick, children, accent,
}: {
  href: string; onClick: () => void; children: React.ReactNode; accent?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-3 px-2 py-2.5 rounded-lg text-sm font-medium transition-colors"
      style={{ color: accent ? "var(--accent)" : "var(--foreground)" }}
    >
      {children}
    </Link>
  );
}

// Small inline SVG icons (16x16)
const iconProps = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };

function FeedIcon() { return <svg {...iconProps}><path d="M4 11a9 9 0 0 1 9 9" /><path d="M4 4a16 16 0 0 1 16 16" /><circle cx="5" cy="19" r="1" /></svg>; }
function ExploreIcon() { return <svg {...iconProps}><circle cx="12" cy="12" r="10" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" /></svg>; }
function PenPalsIcon() { return <svg {...iconProps}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>; }
function WriteIcon() { return <svg {...iconProps}><path d="M12 5v14M5 12h14" /></svg>; }
function DraftsIcon() { return <svg {...iconProps}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>; }
function NotificationsIcon() { return <svg {...iconProps}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>; }
function SearchIcon() { return <svg {...iconProps}><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>; }
function ProfileIcon() { return <svg {...iconProps}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>; }
function SettingsIcon() { return <svg {...iconProps}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>; }
function FeedbackIcon() { return <svg {...iconProps}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>; }
function SubmitFeedbackIcon() { return <svg {...iconProps}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="M12 8v4M10 10h4" /></svg>; }
function InviteIcon() { return <svg {...iconProps}><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>; }
function AdminIcon() { return <svg {...iconProps}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>; }
function LettersIcon() { return <svg {...iconProps}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>; }
function SavedIcon() { return <svg {...iconProps} fill="currentColor"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>; }
