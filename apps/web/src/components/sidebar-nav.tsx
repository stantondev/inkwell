"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useLiveNavCounts } from "./live-nav-counts";
import { SignOutButton } from "./sign-out-button";
import { AvatarWithFrame } from "./avatar-with-frame";
import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { PollWidget } from "./poll-widget";

interface SidebarNavProps {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  avatarFrame?: string | null;
  avatarAnimation?: string | null;
  subscriptionTier?: string;
  inkDonorStatus?: string | null;
  isAdmin?: boolean;
  initialNotificationCount: number;
  initialLetterCount: number;
  initialDraftCount: number;
  activePoll?: import("./poll-widget").PollData | null;
  serverSidebarHidden?: boolean;
}

// Small inline SVG icons (16x16) — reused from mobile-menu
const iconProps = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
};

function FeedIcon() { return <svg {...iconProps}><path d="M4 11a9 9 0 0 1 9 9" /><path d="M4 4a16 16 0 0 1 16 16" /><circle cx="5" cy="19" r="1" /></svg>; }
function ExploreIcon() { return <svg {...iconProps}><circle cx="12" cy="12" r="10" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" /></svg>; }
function WriteIcon() { return <svg {...iconProps}><path d="M12 5v14M5 12h14" /></svg>; }
function PenPalsIcon() { return <svg {...iconProps}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>; }
function LettersIcon() { return <svg {...iconProps}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>; }
function SavedIcon() { return <svg {...iconProps} fill="currentColor"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>; }
function PostsIcon() { return <svg {...iconProps}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>; }
function DraftsIcon() { return <svg {...iconProps}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>; }
function SearchIcon() { return <svg {...iconProps}><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>; }
function RoadmapIcon() { return <svg {...iconProps}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>; }
function SubmitFeedbackIcon() { return <svg {...iconProps}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="M12 8v4M10 10h4" /></svg>; }
function HelpIcon() { return <svg {...iconProps}><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>; }
function InviteIcon() { return <svg {...iconProps}><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>; }
function PollsIcon() { return <svg {...iconProps}><path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" /></svg>; }
function CirclesIcon() { return <svg {...iconProps}><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>; }
function NotificationsIcon() { return <svg {...iconProps}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>; }
function SettingsIcon() { return <svg {...iconProps}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>; }
function AdminIcon() { return <svg {...iconProps}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>; }
function HideIcon() { return <svg {...iconProps} width="14" height="14"><path d="M11 19l-7-7 7-7" /></svg>; }
function RevealIcon() { return <svg {...iconProps} width="10" height="10"><path d="M9 18l6-6-6-6" /></svg>; }

function NavItem({
  href,
  icon,
  label,
  badge,
  active,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  badge?: number;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`sidebar-nav-link ${active ? "sidebar-nav-link--active" : ""}`}
    >
      <span className="sidebar-nav-icon">{icon}</span>
      <span className="sidebar-nav-label">{label}</span>
      {badge != null && badge > 0 && (
        <>
          <span className="sidebar-dot-leader" />
          <span className="sidebar-nav-badge" data-danger={badge > 0 ? "true" : undefined}>
            {badge > 99 ? "99+" : badge}
          </span>
        </>
      )}
    </Link>
  );
}

export function SidebarNav({
  username,
  displayName,
  avatarUrl,
  avatarFrame,
  avatarAnimation,
  subscriptionTier,
  inkDonorStatus,
  isAdmin,
  initialNotificationCount,
  initialLetterCount,
  initialDraftCount,
  activePoll,
  serverSidebarHidden,
}: SidebarNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { draftCount, unreadNotificationCount, unreadLetterCount } = useLiveNavCounts({
    draftCount: initialDraftCount,
    unreadNotificationCount: initialNotificationCount,
    unreadLetterCount: initialLetterCount,
  });

  // Hidden state — persisted in localStorage
  const [hidden, setHidden] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Migrate old localStorage key
    const oldKey = localStorage.getItem("inkwell-sidebar-collapsed");
    if (oldKey === "true") {
      localStorage.removeItem("inkwell-sidebar-collapsed");
      localStorage.setItem("inkwell-sidebar-hidden", "true");
    }
    // Prefer server value if available, otherwise fall back to localStorage
    const isHidden = serverSidebarHidden !== undefined
      ? serverSidebarHidden
      : localStorage.getItem("inkwell-sidebar-hidden") === "true";
    if (isHidden) {
      setHidden(true);
      document.body.setAttribute("data-sidebar-hidden", "");
    }
  }, [serverSidebarHidden]);

  const toggleHidden = useCallback(() => {
    setHidden((prev) => {
      const next = !prev;
      localStorage.setItem("inkwell-sidebar-hidden", String(next));
      if (next) {
        document.body.setAttribute("data-sidebar-hidden", "");
      } else {
        document.body.removeAttribute("data-sidebar-hidden");
      }
      // Persist to DB
      fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { sidebar_hidden: next } }),
      }).catch(() => {});
      return next;
    });
  }, []);

  // Keyboard shortcut: Cmd/Ctrl + \ to toggle hidden
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        toggleHidden();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleHidden]);

  // Keyboard shortcut: Cmd/Ctrl + K to search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (pathname === "/explore") {
          // Already on Explore — focus the search bar
          window.dispatchEvent(new Event("inkwell-search-focus"));
        } else {
          // Navigate to Explore and focus on arrival
          router.push("/explore");
          // The search bar's own Cmd+K listener will handle focus
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [pathname, router]);

  const isActive = (href: string) => {
    if (href === "/feed") return pathname === "/feed";
    if (href === "/explore") return pathname === "/explore";
    if (href === "/editor") return pathname === "/editor";
    if (href === `/${username}`) return pathname === `/${username}`;
    return pathname.startsWith(href);
  };

  const [shortcutHint, setShortcutHint] = useState("Ctrl+\\");
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.userAgent)) {
      setShortcutHint("\u2318\\");
    }
  }, []);

  return (
    <>
      {/* ─── Logo ─── */}
      <div className="sidebar-logo">
        <Link href="/" aria-label="Inkwell home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/inkwell-logo.svg"
            alt="Inkwell"
            className="dark:brightness-0 dark:invert"
            style={{ height: 38, width: "auto" }}
          />
        </Link>
      </div>

      {/* ─── I. Your Journal ─── */}
      <div className="sidebar-section">
        <div className="sidebar-section-heading">
          <span className="sidebar-section-numeral">I.</span>
          <span className="sidebar-section-title">Your Journal</span>
        </div>
        <NavItem href="/feed" icon={<FeedIcon />} label="Feed" active={isActive("/feed")} />
        <NavItem href="/explore" icon={<ExploreIcon />} label="Explore" active={isActive("/explore")} />
        <Link
          href="/editor"
          className="sidebar-write-btn"
        >
          <WriteIcon />
          <span className="sidebar-nav-label">Write</span>
        </Link>
      </div>

      {/* ─── II. Connections ─── */}
      <div className="sidebar-section">
        <div className="sidebar-section-heading">
          <span className="sidebar-section-numeral">II.</span>
          <span className="sidebar-section-title">Connections</span>
        </div>
        <NavItem href="/pen-pals" icon={<PenPalsIcon />} label="Pen Pals" active={isActive("/pen-pals")} />
        <NavItem href="/letters" icon={<LettersIcon />} label="Letters" badge={unreadLetterCount} active={isActive("/letters")} />
      </div>

      {/* ─── III. Library ─── */}
      <div className="sidebar-section">
        <div className="sidebar-section-heading">
          <span className="sidebar-section-numeral">III.</span>
          <span className="sidebar-section-title">Library</span>
        </div>
        <NavItem href="/saved" icon={<SavedIcon />} label="Bookmarks" active={isActive("/saved")} />
        <NavItem href="/manage" icon={<PostsIcon />} label="Posts" active={isActive("/manage")} />
        <NavItem href="/drafts" icon={<DraftsIcon />} label="Drafts" badge={draftCount} active={isActive("/drafts")} />
      </div>

      {/* ─── IV. Community ─── */}
      <div className="sidebar-section">
        <div className="sidebar-section-heading">
          <span className="sidebar-section-numeral">IV.</span>
          <span className="sidebar-section-title">Community</span>
        </div>
        <NavItem href="/roadmap" icon={<RoadmapIcon />} label="Roadmap" active={isActive("/roadmap")} />
        <NavItem href="/polls" icon={<PollsIcon />} label="Polls" active={isActive("/polls")} />
        <NavItem href="/circles" icon={<CirclesIcon />} label="Circles" active={isActive("/circles")} />
        <NavItem href="/roadmap/new" icon={<SubmitFeedbackIcon />} label="Feedback" active={pathname === "/roadmap/new"} />
        <NavItem href="/help" icon={<HelpIcon />} label="Help" active={isActive("/help")} />
        <NavItem href="/settings/invite" icon={<InviteIcon />} label="Invite friends" active={isActive("/settings/invite")} />
        {activePoll && !activePoll.my_vote && (
          <div style={{ padding: "4px 0 0" }}>
            <PollWidget poll={activePoll} compact isLoggedIn={true} />
          </div>
        )}
      </div>

      {/* ─── Ornament divider ─── */}
      <div className="sidebar-ornament" aria-hidden="true">
        <span>· · ·</span>
      </div>

      {/* ─── User section ─── */}
      <div className="sidebar-user-section">
        <Link
          href={`/${username}`}
          className="sidebar-user-profile"
        >
          <AvatarWithFrame
            url={avatarUrl}
            name={displayName}
            size={32}
            frame={avatarFrame}
            animation={avatarAnimation}
            subscriptionTier={subscriptionTier}
          />
          <div className="sidebar-user-info">
            <span className="sidebar-user-name">{displayName}</span>
            <span className="sidebar-user-handle">@{username}</span>
          </div>
        </Link>

        <NavItem
          href="/notifications"
          icon={<NotificationsIcon />}
          label="Notifications"
          badge={unreadNotificationCount}
          active={isActive("/notifications")}
        />
        <NavItem href="/settings" icon={<SettingsIcon />} label="Settings" active={isActive("/settings")} />

        {subscriptionTier !== "plus" && (
          <Link
            href="/settings/billing"
            className="sidebar-nav-link sidebar-plus-link"
          >
            <span className="sidebar-nav-icon" style={{ color: "var(--accent)" }}>✦</span>
            <span className="sidebar-nav-label">Upgrade to Plus</span>
          </Link>
        )}

        {inkDonorStatus !== "active" && (
          <Link
            href="/settings/billing"
            className="sidebar-nav-link"
            style={{ color: "var(--muted)", fontSize: "12px" }}
          >
            <span className="sidebar-nav-icon" style={{ opacity: 0.6 }}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M12 2C12 2 4 8.5 4 14a8 8 0 0 0 16 0c0-5.5-8-12-8-12Z" />
              </svg>
            </span>
            <span className="sidebar-nav-label" style={{ fontStyle: "italic" }}>Keep the ink flowing. $1/mo</span>
          </Link>
        )}

        {isAdmin && (
          <NavItem href="/admin" icon={<AdminIcon />} label="Admin" active={isActive("/admin")} />
        )}

        <div className="sidebar-signout">
          <SignOutButton />
        </div>
      </div>

      {/* ─── Hide toggle ─── */}
      <button
        className="sidebar-collapse-btn"
        onClick={toggleHidden}
        aria-label={`Hide sidebar (${shortcutHint})`}
        title={`Hide sidebar (${shortcutHint})`}
      >
        <HideIcon />
        <span className="sidebar-collapse-label">Hide</span>
      </button>

      {/* ─── Reveal tab (portal to body, outside sidebar overflow) ─── */}
      {mounted && createPortal(
        <button
          className="sidebar-reveal-tab hidden lg:flex"
          onClick={toggleHidden}
          aria-label={`Show sidebar (${shortcutHint})`}
          title={`Show sidebar (${shortcutHint})`}
        >
          <RevealIcon />
        </button>,
        document.body
      )}
    </>
  );
}
