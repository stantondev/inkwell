"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AvatarWithFrame } from "./avatar-with-frame";
import {
  ProfileIcon, PenPalsIcon, LettersIcon, SearchIcon,
  SavedIcon, DraftsIcon, CirclesIcon, PollsIcon,
  RoadmapIcon, InviteIcon, SettingsIcon, AdminIcon, SignOutIcon,
} from "./nav-icons";

interface MoreSheetProps {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  avatarFrame?: string | null;
  subscriptionTier?: string;
  isAdmin?: boolean;
  unreadLetterCount: number;
  draftCount: number;
  selfHosted?: boolean;
  onClose: () => void;
}

export function MoreSheet({
  username,
  displayName,
  avatarUrl,
  avatarFrame,
  subscriptionTier,
  isAdmin,
  unreadLetterCount,
  draftCount,
  selfHosted,
  onClose,
}: MoreSheetProps) {
  // Lock body scroll while sheet is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return createPortal(
    <>
      {/* Backdrop */}
      <div className="more-sheet-backdrop" onClick={onClose} aria-hidden="true" />

      {/* Sheet */}
      <div className="more-sheet" role="dialog" aria-label="Navigation menu">
        {/* Drag handle */}
        <div className="more-sheet-handle" aria-hidden="true">
          <div className="more-sheet-handle-bar" />
        </div>

        {/* User section */}
        <Link
          href={`/${username}`}
          onClick={onClose}
          className="more-sheet-user"
        >
          <AvatarWithFrame url={avatarUrl} name={displayName} size={44} frame={avatarFrame} subscriptionTier={subscriptionTier} />
          <div className="more-sheet-user-info">
            <span className="more-sheet-user-name">{displayName}</span>
            <span className="more-sheet-user-handle">@{username}</span>
          </div>
        </Link>

        <div className="more-sheet-divider" />

        {/* Navigation sections */}
        <div className="more-sheet-links">
          <SheetLink href={`/${username}`} icon={<ProfileIcon />} label="Profile" onClick={onClose} />
          <SheetLink href="/pen-pals" icon={<PenPalsIcon />} label="Pen Pals" onClick={onClose} />
          <SheetLink href="/letters" icon={<LettersIcon />} label="Letters" onClick={onClose} badge={unreadLetterCount} />
          <SheetLink href="/search" icon={<SearchIcon />} label="Search" onClick={onClose} />

          <div className="more-sheet-divider" />

          <SheetLink href="/saved" icon={<SavedIcon />} label="Bookmarks" onClick={onClose} />
          <SheetLink href="/drafts" icon={<DraftsIcon />} label="Drafts" onClick={onClose} badge={draftCount} badgeStyle="muted" />

          <div className="more-sheet-divider" />

          <SheetLink href="/circles" icon={<CirclesIcon />} label="Circles" onClick={onClose} />
          <SheetLink href="/polls" icon={<PollsIcon />} label="Polls" onClick={onClose} />
          <SheetLink href="/roadmap" icon={<RoadmapIcon />} label="Roadmap" onClick={onClose} />
          <SheetLink href="/settings/invite" icon={<InviteIcon />} label="Invite Friends" onClick={onClose} />

          <div className="more-sheet-divider" />

          <SheetLink href="/settings" icon={<SettingsIcon />} label="Settings" onClick={onClose} />

          {subscriptionTier !== "plus" && !selfHosted && (
            <SheetLink href="/settings/billing" icon={null} label="Upgrade to Plus" onClick={onClose} accent />
          )}

          {isAdmin && (
            <SheetLink href="/admin" icon={<AdminIcon />} label="Admin" onClick={onClose} />
          )}

          <div className="more-sheet-divider" />

          {/* Sign out — uses form action */}
          <form action="/auth/signout" method="POST" className="more-sheet-signout">
            <button type="submit" className="more-sheet-link" onClick={onClose}>
              <span className="more-sheet-link-icon"><SignOutIcon /></span>
              <span>Sign out</span>
            </button>
          </form>
        </div>
      </div>
    </>,
    document.body
  );
}

function SheetLink({
  href,
  icon,
  label,
  badge,
  badgeStyle,
  accent,
  onClick,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  badge?: number;
  badgeStyle?: "muted";
  accent?: boolean;
  onClick: () => void;
}) {
  return (
    <Link href={href} onClick={onClick} className="more-sheet-link">
      <span className="more-sheet-link-icon">
        {accent ? <span style={{ color: "var(--accent)" }}>✦</span> : icon}
      </span>
      <span style={accent ? { color: "var(--accent)", fontWeight: 500 } : undefined}>{label}</span>
      {badge != null && badge > 0 && (
        <span
          className="more-sheet-badge"
          style={badgeStyle === "muted" ? {
            background: "var(--surface-hover)",
            color: "var(--foreground)",
          } : {
            background: "var(--danger)",
            color: "#fff",
          }}
        >
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </Link>
  );
}
