"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useLiveNavCounts } from "./live-nav-counts";
import { AvatarWithFrame } from "./avatar-with-frame";
import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { PollWidget } from "./poll-widget";
import { LookSwitch } from "./look-switch";
import { openJot } from "@/lib/stickies";
import { isSupporter } from "@/lib/supporter";
import { useWhatsNewUnread } from "./whats-new-state";
import {
  FeedIcon, ExploreIcon, GazetteIcon, CirclesIcon, NotificationsIcon, LettersIcon,
  PenPalsIcon, DraftsIcon, PostsIcon, SavedIcon, ReadersIcon, PollsIcon, RoadmapIcon,
  ProfileIcon, SettingsIcon, HelpIcon, InviteIcon, AdminIcon, SignOutIcon,
} from "./nav-icons";

/**
 * The desktop sidebar — "The Contents Page".
 *
 * Reorganised 2026-09-24. It had grown to ~30 rows in one column (four
 * sections, then a user block with Notifications, Settings, the Classic/Modern
 * switch, two upgrade lines, Admin, Sign out and a Hide button), so the most
 * used links scrolled off shorter screens. Now: places you go sit in the
 * sidebar; things about *you* (profile, settings, look, help, what's new,
 * invite, sign out) live in one account menu that opens from your name at the
 * bottom. Sections fold and remember it; Community starts folded.
 */

interface SidebarNavProps {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  avatarFrame?: string | null;
  avatarAnimation?: string | null;
  subscriptionTier?: string;
  inkDonorStatus?: string | null;
  foundingMemberNumber?: number | null;
  selfHosted?: boolean;
  isAdmin?: boolean;
  initialNotificationCount: number;
  initialLetterCount: number;
  initialDraftCount: number;
  activePoll?: import("./poll-widget").PollData | null;
  serverSidebarHidden?: boolean;
  serverWhatsNewSeen?: string;
}

const iconProps = {
  width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const,
};
function StickyIcon() { return <svg {...iconProps}><path d="M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z" /><path d="M15 3v6h6" /></svg>; }
function PenIcon() { return <svg {...iconProps}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>; }
function FeedbackIcon() { return <svg {...iconProps}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="M12 8v4M10 10h4" /></svg>; }
function StarIcon() { return <svg {...iconProps}><path d="M12 3l1.9 5.8H20l-4.9 3.6 1.9 5.8L12 14.6l-5 3.6 1.9-5.8L4 8.8h6.1z" /></svg>; }
function DropIcon() { return <svg {...iconProps} fill="currentColor" stroke="none"><path d="M12 2C12 2 4 8.5 4 14a8 8 0 0 0 16 0c0-5.5-8-12-8-12Z" /></svg>; }
function SidebarIcon() { return <svg {...iconProps}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /><path d="M15 10l-2 2 2 2" /></svg>; }
function RevealIcon() { return <svg {...iconProps} width="10" height="10"><path d="M9 18l6-6-6-6" /></svg>; }
function ChevronIcon() { return <svg {...iconProps} width="12" height="12"><path d="M6 9l6 6 6-6" /></svg>; }
function MoreIcon() { return <svg {...iconProps}><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></svg>; }

function NavItem({ href, icon, label, badge, quietBadge, active }: {
  href: string; icon: React.ReactNode; label: string; badge?: number; quietBadge?: boolean; active: boolean;
}) {
  return (
    <Link href={href} className={`sidebar-nav-link ${active ? "sidebar-nav-link--active" : ""}`} aria-current={active ? "page" : undefined}>
      <span className="sidebar-nav-icon">{icon}</span>
      <span className="sidebar-nav-label">{label}</span>
      {badge != null && badge > 0 && (
        <>
          <span className="sidebar-dot-leader" />
          <span className="sidebar-nav-badge" data-danger={quietBadge ? undefined : "true"}>
            {badge > 99 ? "99+" : badge}
          </span>
        </>
      )}
    </Link>
  );
}

type SectionId = "read" | "letters" | "journal" | "community";
const DEFAULT_OPEN: Record<SectionId, boolean> = { read: true, letters: true, journal: true, community: false };
const SECTIONS_KEY = "inkwell-sidebar-sections";

function Section({ id, numeral, title, open, onToggle, hint, children }: {
  id: SectionId; numeral: string; title: string; open: boolean; onToggle: (id: SectionId) => void;
  hint?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className={`sidebar-section${open ? "" : " sidebar-section--folded"}`}>
      <button
        type="button"
        className="sidebar-section-heading"
        onClick={() => onToggle(id)}
        aria-expanded={open}
        aria-controls={`sidebar-sec-${id}`}
      >
        <span className="sidebar-section-numeral">{numeral}</span>
        <span className="sidebar-section-title">{title}</span>
        {!open && hint}
        <span className="sidebar-section-chevron"><ChevronIcon /></span>
      </button>
      <div id={`sidebar-sec-${id}`} className="sidebar-section-body" hidden={!open}>
        {children}
      </div>
    </div>
  );
}

export function SidebarNav({
  username, displayName, avatarUrl, avatarFrame, avatarAnimation, subscriptionTier, inkDonorStatus,
  foundingMemberNumber, selfHosted, isAdmin, initialNotificationCount, initialLetterCount,
  initialDraftCount, activePoll, serverSidebarHidden, serverWhatsNewSeen,
}: SidebarNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { draftCount, unreadNotificationCount, unreadLetterCount } = useLiveNavCounts({
    draftCount: initialDraftCount,
    unreadNotificationCount: initialNotificationCount,
    unreadLetterCount: initialLetterCount,
  });
  const whatsNewUnread = useWhatsNewUnread(serverWhatsNewSeen);

  // ── Hidden state — persisted in localStorage + settings ──
  const [hidden, setHidden] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const oldKey = localStorage.getItem("inkwell-sidebar-collapsed");
    if (oldKey === "true") {
      localStorage.removeItem("inkwell-sidebar-collapsed");
      localStorage.setItem("inkwell-sidebar-hidden", "true");
    }
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
      if (next) document.body.setAttribute("data-sidebar-hidden", "");
      else document.body.removeAttribute("data-sidebar-hidden");
      fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { sidebar_hidden: next } }),
      }).catch(() => {});
      return next;
    });
  }, []);

  // ── Folded sections — per browser, applied after mount ──
  const [open, setOpen] = useState<Record<SectionId, boolean>>(DEFAULT_OPEN);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SECTIONS_KEY) || "null");
      if (saved && typeof saved === "object") setOpen({ ...DEFAULT_OPEN, ...saved });
    } catch {}
  }, []);
  const toggleSection = useCallback((id: SectionId) => {
    setOpen((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem(SECTIONS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // ── Keyboard shortcuts ──
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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        // Settings has its own ⌘K jump palette; leave it to that.
        if (pathname === "/settings" || pathname.startsWith("/settings/")) return;
        e.preventDefault();
        if (pathname === "/explore") window.dispatchEvent(new Event("inkwell-search-focus"));
        else router.push("/explore");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [pathname, router]);

  const isActive = (href: string) => {
    if (["/feed", "/explore", "/roadmap"].includes(href)) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  };

  const [shortcutHint, setShortcutHint] = useState("Ctrl+\\");
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.userAgent)) setShortcutHint("⌘\\");
  }, []);

  // ── Account menu ──
  const [menuOpen, setMenuOpen] = useState(false);
  const accountRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ left: number; bottom: number; width: number } | null>(null);

  const openMenu = () => {
    const r = accountRef.current?.getBoundingClientRect();
    if (r) setMenuPos({ left: r.left, bottom: window.innerHeight - r.top + 8, width: Math.max(r.width, 236) });
    setMenuOpen(true);
  };
  const closeMenu = useCallback((refocus = false) => {
    setMenuOpen(false);
    if (refocus) accountRef.current?.focus();
  }, []);

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || accountRef.current?.contains(t)) return;
      closeMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); closeMenu(true); }
    };
    const onResize = () => closeMenu();
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    menuRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [menuOpen, closeMenu]);

  const supporter = isSupporter({
    subscription_tier: subscriptionTier,
    ink_donor_status: inkDonorStatus,
    founding_member_number: foundingMemberNumber,
    self_hosted: selfHosted,
  });
  const showPlus = subscriptionTier !== "plus" && !selfHosted;
  const pollWaiting = !!activePoll && !activePoll.my_vote;

  return (
    <>
      {/* ─── Top: logo + hide ─── */}
      <div className="sidebar-top">
        <Link href="/feed" aria-label="Inkwell — your feed" className="sidebar-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/inkwell-logo.svg" alt="Inkwell" className="dark:brightness-0 dark:invert" style={{ height: 34, width: "auto" }} />
        </Link>
        <button
          type="button"
          className="sidebar-icon-btn"
          onClick={toggleHidden}
          aria-label={`Hide sidebar (${shortcutHint})`}
          title={`Hide sidebar (${shortcutHint})`}
        >
          <SidebarIcon />
        </button>
      </div>

      {/* ─── Write ─── */}
      <div className="sidebar-write-row">
        <Link href="/editor" className="sidebar-write-btn">
          <PenIcon />
          <span>Write an entry</span>
        </Link>
        <button type="button" className="sidebar-jot-btn" onClick={openJot} title="Jot a sticky: a short thought" aria-label="Jot a sticky">
          <StickyIcon />
        </button>
      </div>

      <nav className="sidebar-scroll" aria-label="Sections">
        <Section id="read" numeral="I." title="Read" open={open.read} onToggle={toggleSection}>
          <NavItem href="/feed" icon={<FeedIcon />} label="Feed" active={isActive("/feed")} />
          <NavItem href="/explore" icon={<ExploreIcon />} label="Explore" active={isActive("/explore")} />
          <NavItem href="/gazette" icon={<GazetteIcon />} label="Gazette" active={isActive("/gazette")} />
          <NavItem href="/circles" icon={<CirclesIcon />} label="Circles" active={isActive("/circles")} />
        </Section>

        <Section
          id="letters"
          numeral="II."
          title="Correspondence"
          open={open.letters}
          onToggle={toggleSection}
          hint={unreadNotificationCount + unreadLetterCount > 0 ? <span className="sidebar-section-dot" aria-label="Unread" /> : null}
        >
          <NavItem href="/notifications" icon={<NotificationsIcon />} label="Notifications" badge={unreadNotificationCount} active={isActive("/notifications")} />
          <NavItem href="/letters" icon={<LettersIcon />} label="Letters" badge={unreadLetterCount} active={isActive("/letters")} />
          <NavItem href="/pen-pals" icon={<PenPalsIcon />} label="Pen Pals" active={isActive("/pen-pals")} />
        </Section>

        <Section id="journal" numeral="III." title="Your journal" open={open.journal} onToggle={toggleSection}>
          <NavItem href="/drafts" icon={<DraftsIcon />} label="Drafts" badge={draftCount} quietBadge active={isActive("/drafts")} />
          <NavItem href="/manage" icon={<PostsIcon />} label="Posts" active={isActive("/manage")} />
          <NavItem href="/saved" icon={<SavedIcon />} label="Bookmarks" active={isActive("/saved")} />
          <NavItem href="/readers" icon={<ReadersIcon />} label="Readers" active={isActive("/readers")} />
        </Section>

        <Section
          id="community"
          numeral="IV."
          title="Community"
          open={open.community}
          onToggle={toggleSection}
          hint={pollWaiting ? <span className="sidebar-section-hint">poll open</span> : null}
        >
          <NavItem href="/polls" icon={<PollsIcon />} label="Polls" active={isActive("/polls")} />
          <NavItem href="/roadmap" icon={<RoadmapIcon />} label="Roadmap" active={isActive("/roadmap")} />
          <NavItem href="/roadmap/new" icon={<FeedbackIcon />} label="Send feedback" active={pathname === "/roadmap/new"} />
          {pollWaiting && (
            <div style={{ padding: "6px 0 0" }}>
              <PollWidget poll={activePoll!} compact isLoggedIn={true} />
            </div>
          )}
        </Section>
      </nav>

      {/* ─── Bottom: Plus + account ─── */}
      <div className="sidebar-footer">
        {showPlus && (
          <Link href="/settings/billing" className="sidebar-plus-card">
            <span className="sidebar-plus-star" aria-hidden="true">✦</span>
            <span>
              <span className="sidebar-plus-title">Inkwell Plus</span>
              <span className="sidebar-plus-sub">Themes, custom domain, reader stats</span>
            </span>
          </Link>
        )}

        <button
          ref={accountRef}
          type="button"
          className={`sidebar-account${menuOpen ? " sidebar-account--open" : ""}`}
          onClick={() => (menuOpen ? closeMenu() : openMenu())}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <AvatarWithFrame url={avatarUrl} name={displayName} size={32} frame={avatarFrame} animation={avatarAnimation} subscriptionTier={subscriptionTier} />
          <span className="sidebar-user-info">
            <span className="sidebar-user-name">{displayName}</span>
            <span className="sidebar-user-handle">@{username}</span>
          </span>
          {whatsNewUnread && <span className="whats-new-dot" aria-label="Something new on Inkwell" />}
          <span className="sidebar-account-more"><MoreIcon /></span>
        </button>
      </div>

      {/* ─── Account menu (portal: escapes the sidebar's overflow) ─── */}
      {mounted && menuOpen && menuPos && createPortal(
        <div
          ref={menuRef}
          className="account-menu"
          role="menu"
          aria-label="Your account"
          style={{ left: menuPos.left, bottom: menuPos.bottom, width: menuPos.width }}
          onClick={(e) => { if ((e.target as Element).closest("a")) closeMenu(); }}
        >
          <MenuLink href={`/${username}`} icon={<ProfileIcon />} label="Your journal page" sub={`@${username}`} />
          <MenuLink href="/settings" icon={<SettingsIcon />} label="Settings" />
          <div className="account-menu-look"><LookSwitch variant="menu" /></div>
          <div className="account-menu-sep" />
          <MenuLink href="/whats-new" icon={<StarIcon />} label="What’s new" dot={whatsNewUnread} />
          <MenuLink href="/help" icon={<HelpIcon />} label="Help" />
          <MenuLink href="/settings/invite" icon={<InviteIcon />} label="Invite friends" />
          {!supporter && (
            <MenuLink href="/settings/billing" icon={<DropIcon />} label="Keep the ink flowing" sub="Ink Donor from $1/mo" />
          )}
          {isAdmin && <MenuLink href="/admin" icon={<AdminIcon />} label="Admin" />}
          <div className="account-menu-sep" />
          <button type="button" role="menuitem" className="account-menu-item" onClick={() => { closeMenu(); toggleHidden(); }}>
            <span className="account-menu-icon"><SidebarIcon /></span>
            <span className="account-menu-label">Hide sidebar</span>
            <kbd className="account-menu-kbd">{shortcutHint}</kbd>
          </button>
          <form action="/auth/signout" method="POST">
            <button type="submit" role="menuitem" className="account-menu-item account-menu-item--quiet">
              <span className="account-menu-icon"><SignOutIcon /></span>
              <span className="account-menu-label">Sign out</span>
            </button>
          </form>
        </div>,
        document.body,
      )}

      {/* ─── Reveal tab when hidden ─── */}
      {mounted && createPortal(
        <button
          className="sidebar-reveal-tab hidden lg:flex"
          onClick={toggleHidden}
          aria-label={`Show sidebar (${shortcutHint})`}
          title={`Show sidebar (${shortcutHint})`}
          tabIndex={hidden ? 0 : -1}
        >
          <RevealIcon />
        </button>,
        document.body,
      )}
    </>
  );
}

function MenuLink({ href, icon, label, sub, dot }: { href: string; icon: React.ReactNode; label: string; sub?: string; dot?: boolean }) {
  return (
    <Link href={href} role="menuitem" className="account-menu-item">
      <span className="account-menu-icon">{icon}</span>
      <span className="account-menu-label">
        {label}
        {sub && <span className="account-menu-sub">{sub}</span>}
      </span>
      {dot && <span className="whats-new-dot" aria-label="New" />}
    </Link>
  );
}
