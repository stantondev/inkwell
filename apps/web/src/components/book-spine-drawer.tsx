"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AvatarWithFrame } from "./avatar-with-frame";
import {
  FeedIcon, ExploreIcon, PenPalsIcon, LettersIcon,
  SearchIcon, SavedIcon, DraftsIcon, CirclesIcon, PollsIcon,
  RoadmapIcon, InviteIcon, SettingsIcon, AdminIcon, SignOutIcon,
} from "./nav-icons";

interface BookSpineDrawerProps {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  avatarFrame?: string | null;
  subscriptionTier?: string;
  inkDonorStatus?: string | null;
  isAdmin?: boolean;
  unreadLetterCount: number;
  draftCount: number;
  selfHosted?: boolean;
  onClose: () => void;
}

export function BookSpineDrawer({
  username,
  displayName,
  avatarUrl,
  avatarFrame,
  subscriptionTier,
  inkDonorStatus,
  isAdmin,
  unreadLetterCount,
  draftCount,
  selfHosted,
  onClose,
}: BookSpineDrawerProps) {
  const pathname = usePathname();
  const [closing, setClosing] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);
  const touchDelta = useRef(0);
  const isDragging = useRef(false);

  const isActive = useCallback((href: string) => {
    if (href === "/feed") return pathname === "/feed" || pathname === "/";
    if (href === "/explore") return pathname === "/explore" || pathname.startsWith("/explore/") || pathname.startsWith("/category/") || pathname.startsWith("/tag/");
    return pathname === href || pathname.startsWith(href + "/");
  }, [pathname]);

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(() => onClose(), 300);
  }, [onClose]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [close]);

  // Swipe-to-close gesture
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchDelta.current = 0;
    isDragging.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const delta = e.touches[0].clientX - touchStartX.current;
    // Only track leftward swipes
    if (delta < -10) {
      isDragging.current = true;
      touchDelta.current = delta;
      if (drawerRef.current) {
        drawerRef.current.style.transform = `translateX(${Math.min(0, delta)}px)`;
        drawerRef.current.style.transition = "none";
      }
    }
  };

  const handleTouchEnd = () => {
    if (drawerRef.current) {
      drawerRef.current.style.transition = "";
    }
    if (isDragging.current && touchDelta.current < -80) {
      close();
    } else if (drawerRef.current) {
      drawerRef.current.style.transform = "";
    }
    isDragging.current = false;
  };

  const handleLinkClick = () => close();

  const isPlus = subscriptionTier === "plus";
  const isDonor = inkDonorStatus === "active";

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className={`book-drawer-backdrop ${closing ? "book-drawer-backdrop--closing" : ""}`}
        onClick={close}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className={`book-drawer ${closing ? "book-drawer--closing" : ""}`}
        role="dialog"
        aria-label="Navigation menu"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Paper texture overlay */}
        <svg className="book-drawer-texture" aria-hidden="true">
          <filter id="drawer-paper">
            <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="5" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#drawer-paper)" opacity="0.04" />
        </svg>

        {/* User section */}
        <Link href={`/${username}`} onClick={handleLinkClick} className="book-drawer-user">
          <AvatarWithFrame url={avatarUrl} name={displayName} size={44} frame={avatarFrame} subscriptionTier={subscriptionTier} />
          <div className="book-drawer-user-info">
            <span className="book-drawer-user-name">
              {displayName}
              {isPlus && <span className="book-drawer-plus-badge">✦ Plus</span>}
              {isDonor && <span className="book-drawer-donor-badge">Ink Donor</span>}
            </span>
            <span className="book-drawer-user-handle">@{username}</span>
          </div>
        </Link>

        {/* Navigation sections */}
        <div className="book-drawer-sections">

          {/* I. Your Journal */}
          <div className="book-drawer-section">
            <div className="book-drawer-heading">
              <span className="book-drawer-numeral">I.</span> Your Journal
            </div>
            <DrawerLink href="/feed" icon={<FeedIcon />} label="Feed" active={isActive("/feed")} onClick={handleLinkClick} />
            <DrawerLink href="/explore" icon={<ExploreIcon />} label="Explore" active={isActive("/explore")} onClick={handleLinkClick} />
            <DrawerLink href="/saved" icon={<SavedIcon />} label="Bookmarks" active={isActive("/saved")} onClick={handleLinkClick} />
            <DrawerLink href="/drafts" icon={<DraftsIcon />} label="Drafts" active={isActive("/drafts")} badge={draftCount} badgeStyle="muted" onClick={handleLinkClick} />
          </div>

          {/* II. Connections */}
          <div className="book-drawer-section">
            <div className="book-drawer-heading">
              <span className="book-drawer-numeral">II.</span> Connections
            </div>
            <DrawerLink href="/pen-pals" icon={<PenPalsIcon />} label="Pen Pals" active={isActive("/pen-pals")} onClick={handleLinkClick} />
            <DrawerLink href="/letters" icon={<LettersIcon />} label="Letters" active={isActive("/letters")} badge={unreadLetterCount} onClick={handleLinkClick} />
            <DrawerLink href="/explore" icon={<SearchIcon />} label="Search" active={false} onClick={handleLinkClick} />
          </div>

          {/* III. Community */}
          <div className="book-drawer-section">
            <div className="book-drawer-heading">
              <span className="book-drawer-numeral">III.</span> Community
            </div>
            <DrawerLink href="/circles" icon={<CirclesIcon />} label="Circles" active={isActive("/circles")} onClick={handleLinkClick} />
            <DrawerLink href="/polls" icon={<PollsIcon />} label="Polls" active={isActive("/polls")} onClick={handleLinkClick} />
            <DrawerLink href="/roadmap" icon={<RoadmapIcon />} label="Roadmap" active={isActive("/roadmap")} onClick={handleLinkClick} />
            <DrawerLink href="/settings/invite" icon={<InviteIcon />} label="Invite Friends" active={isActive("/settings/invite")} onClick={handleLinkClick} />
          </div>

          {/* IV. Settings */}
          <div className="book-drawer-section">
            <div className="book-drawer-heading">
              <span className="book-drawer-numeral">IV.</span> Settings
            </div>
            <DrawerLink href="/settings/customize" icon={<SettingsIcon />} label="Customize" active={isActive("/settings/customize")} onClick={handleLinkClick} />
            <DrawerLink href="/settings" icon={<SettingsIcon />} label="Account" active={pathname === "/settings"} onClick={handleLinkClick} />
          </div>

          {/* Ornament */}
          <div className="book-drawer-ornament" aria-hidden="true">· · ·</div>

          {/* Plus upsell */}
          {!isPlus && !selfHosted && (
            <Link href="/settings/billing" onClick={handleLinkClick} className="book-drawer-link book-drawer-upgrade">
              <span className="book-drawer-link-icon" style={{ color: "var(--accent)" }}>✦</span>
              <span>Upgrade to Plus</span>
            </Link>
          )}

          {/* Admin */}
          {isAdmin && (
            <DrawerLink href="/admin" icon={<AdminIcon />} label="Admin" active={isActive("/admin")} onClick={handleLinkClick} />
          )}

          {/* Sign out */}
          <form action="/auth/signout" method="POST" className="book-drawer-signout">
            <button type="submit" className="book-drawer-link" onClick={handleLinkClick}>
              <span className="book-drawer-link-icon"><SignOutIcon /></span>
              <span>Sign out</span>
            </button>
          </form>
        </div>
      </div>
    </>,
    document.body
  );
}

function DrawerLink({
  href,
  icon,
  label,
  active,
  badge,
  badgeStyle,
  onClick,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  badge?: number;
  badgeStyle?: "muted";
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`book-drawer-link ${active ? "book-drawer-link--active" : ""}`}
    >
      <span className="book-drawer-link-icon">{icon}</span>
      <span className="book-drawer-link-label">{label}</span>
      {badge != null && badge > 0 && (
        <>
          <span className="book-drawer-dot-leader" />
          <span
            className="book-drawer-badge"
            style={badgeStyle === "muted" ? {
              background: "var(--surface-hover, var(--border))",
              color: "var(--foreground)",
            } : undefined}
          >
            {badge > 9 ? "9+" : badge}
          </span>
        </>
      )}
    </Link>
  );
}
