"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useLiveNavCounts } from "./live-nav-counts";
import { SignOutButton } from "./sign-out-button";
import { AvatarWithFrame } from "./avatar-with-frame";
import { useState, useEffect, useCallback } from "react";

interface SidebarNavProps {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  avatarFrame?: string | null;
  subscriptionTier?: string;
  isAdmin?: boolean;
  initialNotificationCount: number;
  initialLetterCount: number;
  initialDraftCount: number;
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
function DraftsIcon() { return <svg {...iconProps}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>; }
function SearchIcon() { return <svg {...iconProps}><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>; }
function RoadmapIcon() { return <svg {...iconProps}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>; }
function SubmitFeedbackIcon() { return <svg {...iconProps}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="M12 8v4M10 10h4" /></svg>; }
function InviteIcon() { return <svg {...iconProps}><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>; }
function NotificationsIcon() { return <svg {...iconProps}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>; }
function SettingsIcon() { return <svg {...iconProps}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>; }
function AdminIcon() { return <svg {...iconProps}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>; }
function CollapseIcon() { return <svg {...iconProps} width="14" height="14"><path d="M11 19l-7-7 7-7" /></svg>; }
function ExpandIcon() { return <svg {...iconProps} width="14" height="14"><path d="M9 18l6-6-6-6" /></svg>; }

function NavItem({
  href,
  icon,
  label,
  badge,
  active,
  collapsed,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  badge?: number;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      href={href}
      className={`sidebar-nav-link ${active ? "sidebar-nav-link--active" : ""}`}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
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
  subscriptionTier,
  isAdmin,
  initialNotificationCount,
  initialLetterCount,
  initialDraftCount,
}: SidebarNavProps) {
  const pathname = usePathname();
  const { draftCount, unreadNotificationCount, unreadLetterCount } = useLiveNavCounts({
    draftCount: initialDraftCount,
    unreadNotificationCount: initialNotificationCount,
    unreadLetterCount: initialLetterCount,
  });

  // Collapse state — persisted in localStorage
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("inkwell-sidebar-collapsed");
    if (stored === "true") {
      setCollapsed(true);
      document.body.setAttribute("data-sidebar-collapsed", "");
    }
  }, []);

  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("inkwell-sidebar-collapsed", String(next));
      if (next) {
        document.body.setAttribute("data-sidebar-collapsed", "");
      } else {
        document.body.removeAttribute("data-sidebar-collapsed");
      }
      return next;
    });
  }, []);

  // Keyboard shortcut: Cmd/Ctrl + \ to toggle collapse
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        toggleCollapse();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleCollapse]);

  const isActive = (href: string) => {
    if (href === "/feed") return pathname === "/feed";
    if (href === "/explore") return pathname === "/explore";
    if (href === "/editor") return pathname === "/editor";
    if (href === `/${username}`) return pathname === `/${username}`;
    return pathname.startsWith(href);
  };

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
            style={{ height: collapsed ? 24 : 38, width: "auto", transition: "height 200ms ease" }}
          />
        </Link>
      </div>

      {/* ─── I. Your Journal ─── */}
      <div className="sidebar-section">
        <div className="sidebar-section-heading">
          <span className="sidebar-section-numeral">I.</span>
          <span className="sidebar-section-title">Your Journal</span>
        </div>
        <NavItem href="/feed" icon={<FeedIcon />} label="Feed" active={isActive("/feed")} collapsed={collapsed} />
        <NavItem href="/explore" icon={<ExploreIcon />} label="Explore" active={isActive("/explore")} collapsed={collapsed} />
        <Link
          href="/editor"
          className="sidebar-write-btn"
          title={collapsed ? "Write" : undefined}
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
        <NavItem href="/pen-pals" icon={<PenPalsIcon />} label="Pen Pals" active={isActive("/pen-pals")} collapsed={collapsed} />
        <NavItem href="/letters" icon={<LettersIcon />} label="Letterbox" badge={unreadLetterCount} active={isActive("/letters")} collapsed={collapsed} />
        <NavItem href="/search" icon={<SearchIcon />} label="Search" active={isActive("/search")} collapsed={collapsed} />
      </div>

      {/* ─── III. Library ─── */}
      <div className="sidebar-section">
        <div className="sidebar-section-heading">
          <span className="sidebar-section-numeral">III.</span>
          <span className="sidebar-section-title">Library</span>
        </div>
        <NavItem href="/saved" icon={<SavedIcon />} label="Bookmarks" active={isActive("/saved")} collapsed={collapsed} />
        <NavItem href="/drafts" icon={<DraftsIcon />} label="Drafts" badge={draftCount} active={isActive("/drafts")} collapsed={collapsed} />
      </div>

      {/* ─── IV. Community ─── */}
      <div className="sidebar-section">
        <div className="sidebar-section-heading">
          <span className="sidebar-section-numeral">IV.</span>
          <span className="sidebar-section-title">Community</span>
        </div>
        <NavItem href="/roadmap" icon={<RoadmapIcon />} label="Roadmap" active={isActive("/roadmap")} collapsed={collapsed} />
        <NavItem href="/roadmap/new" icon={<SubmitFeedbackIcon />} label="Feedback" active={pathname === "/roadmap/new"} collapsed={collapsed} />
        <NavItem href="/settings/invite" icon={<InviteIcon />} label="Invite friends" active={isActive("/settings/invite")} collapsed={collapsed} />
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
          title={collapsed ? `@${username}` : undefined}
        >
          <AvatarWithFrame
            url={avatarUrl}
            name={displayName}
            size={collapsed ? 28 : 32}
            frame={avatarFrame}
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
          collapsed={collapsed}
        />
        <NavItem href="/settings" icon={<SettingsIcon />} label="Settings" active={isActive("/settings")} collapsed={collapsed} />

        {subscriptionTier !== "plus" && (
          <Link
            href="/settings/billing"
            className="sidebar-nav-link sidebar-plus-link"
            title={collapsed ? "Upgrade to Plus" : undefined}
          >
            <span className="sidebar-nav-icon" style={{ color: "var(--accent)" }}>✦</span>
            <span className="sidebar-nav-label">Upgrade to Plus</span>
          </Link>
        )}

        {isAdmin && (
          <NavItem href="/admin" icon={<AdminIcon />} label="Admin" active={isActive("/admin")} collapsed={collapsed} />
        )}

        <div className="sidebar-signout">
          <SignOutButton />
        </div>
      </div>

      {/* ─── Collapse toggle ─── */}
      <button
        className="sidebar-collapse-btn"
        onClick={toggleCollapse}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand (⌘\\)" : "Collapse (⌘\\)"}
      >
        {collapsed ? <ExpandIcon /> : <CollapseIcon />}
      </button>
    </>
  );
}
