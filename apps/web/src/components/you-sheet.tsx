"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AvatarWithFrame } from "./avatar-with-frame";
import { usePwaInstall } from "@/lib/pwa";
import {
  DraftsIcon, PostsIcon, SavedIcon, ReadersIcon, PenPalsIcon, LettersIcon,
  GazetteIcon, CirclesIcon, PollsIcon, RoadmapIcon,
  SettingsIcon, InviteIcon, HelpIcon, AdminIcon, SignOutIcon,
} from "./nav-icons";

/**
 * "You" — the mobile menu, opened from the last tab.
 *
 * Replaced the left "book spine" drawer (2026-09-22). That drawer listed 20
 * links in four sections, several of them duplicates of the tab bar (Feed,
 * Explore, Search→Explore, Letters) or of each other (Customize and Settings,
 * same icon), and opened with an edge swipe that fought iOS's own back gesture
 * and the reader's page turns. This sheet rises from the bottom where the thumb
 * already is, and lists only what the tab bar and top bar don't.
 */

export interface YouSheetProps {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  avatarFrame?: string | null;
  avatarAnimation?: string | null;
  subscriptionTier?: string;
  inkDonorStatus?: string | null;
  isAdmin?: boolean;
  selfHosted?: boolean;
  unreadLetterCount: number;
  draftCount: number;
  onClose: () => void;
}

export function YouSheet({
  username,
  displayName,
  avatarUrl,
  avatarFrame,
  avatarAnimation,
  subscriptionTier,
  inkDonorStatus,
  isAdmin,
  selfHosted,
  unreadLetterCount,
  draftCount,
  onClose,
}: YouSheetProps) {
  const pathname = usePathname();
  const openedAt = useRef(pathname);
  const [closing, setClosing] = useState(false);
  const [iosHelp, setIosHelp] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; dy: number } | null>(null);
  const install = usePwaInstall();

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 220);
  }, [onClose]);

  // A link inside was followed: the route changed, so get out of the way.
  useEffect(() => {
    if (pathname !== openedAt.current) onClose();
  }, [pathname, onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    sheetRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [close]);

  // Drag the handle/header down to dismiss.
  const onDragStart = (e: React.TouchEvent) => {
    drag.current = { y: e.touches[0].clientY, dy: 0 };
  };
  const onDragMove = (e: React.TouchEvent) => {
    if (!drag.current || !sheetRef.current) return;
    const dy = Math.max(0, e.touches[0].clientY - drag.current.y);
    drag.current.dy = dy;
    sheetRef.current.style.transition = "none";
    sheetRef.current.style.transform = `translateY(${dy}px)`;
  };
  const onDragEnd = () => {
    const el = sheetRef.current;
    const dy = drag.current?.dy ?? 0;
    drag.current = null;
    if (!el) return;
    el.style.transition = "";
    if (dy > 90) close();
    else el.style.transform = "";
  };

  const isPlus = subscriptionTier === "plus";
  const isDonor = inkDonorStatus === "active";
  const showInstall = !install.installed && (install.canPrompt || install.ios);

  async function handleInstall() {
    if (install.canPrompt) await install.prompt();
    else setIosHelp((v) => !v);
  }

  return createPortal(
    <>
      <div className={`you-sheet-backdrop${closing ? " you-sheet-backdrop--closing" : ""}`} onClick={close} aria-hidden="true" />
      <div
        ref={sheetRef}
        className={`you-sheet${closing ? " you-sheet--closing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Your menu"
        tabIndex={-1}
        onClick={(e) => { if ((e.target as Element).closest("a")) onClose(); }}
      >
        <div className="you-sheet-grab" onTouchStart={onDragStart} onTouchMove={onDragMove} onTouchEnd={onDragEnd} onTouchCancel={onDragEnd}>
          <div className="you-sheet-handle" aria-hidden="true" />

          <Link href={`/${username}`} className="you-sheet-profile">
            <AvatarWithFrame url={avatarUrl} name={displayName} size={48} frame={avatarFrame} animation={avatarAnimation} subscriptionTier={subscriptionTier} />
            <span className="you-sheet-profile-text">
              <span className="you-sheet-name">
                {displayName}
                {isPlus && <span className="you-sheet-pill">✦ Plus</span>}
                {isDonor && <span className="you-sheet-pill you-sheet-pill--muted">Ink Donor</span>}
              </span>
              <span className="you-sheet-handle-text">@{username} · View your journal</span>
            </span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="you-sheet-chevron"><path d="M9 18l6-6-6-6" /></svg>
          </Link>
        </div>

        <div className="you-sheet-body">
          <div className="you-sheet-tiles">
            <Tile href="/drafts" label="Drafts" badge={draftCount} muted icon={<DraftsIcon size={20} />} />
            <Tile href="/manage" label="Posts" icon={<PostsIcon size={20} />} />
            <Tile href="/saved" label="Bookmarks" icon={<SavedIcon size={20} />} />
            <Tile href="/pen-pals" label="Pen Pals" icon={<PenPalsIcon size={20} />} />
            <Tile href="/letters" label="Letters" badge={unreadLetterCount} icon={<LettersIcon size={20} />} />
            <Tile href="/readers" label="Readers" icon={<ReadersIcon size={20} />} />
          </div>

          <div className="you-sheet-label">Community</div>
          <div className="you-sheet-chips">
            <Chip href="/gazette" label="Gazette" icon={<GazetteIcon size={16} />} />
            <Chip href="/circles" label="Circles" icon={<CirclesIcon size={16} />} />
            <Chip href="/polls" label="Polls" icon={<PollsIcon size={16} />} />
            <Chip href="/roadmap" label="Roadmap" icon={<RoadmapIcon size={16} />} />
          </div>

          <div className="you-sheet-list">
            {!isPlus && !selfHosted && (
              <Row href="/settings/billing" label="Upgrade to Plus" icon={<span className="you-sheet-star">✦</span>} accent />
            )}
            {showInstall && (
              <>
                <button type="button" className="you-sheet-row" onClick={handleInstall}>
                  <span className="you-sheet-row-icon" aria-hidden="true">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="2" width="12" height="20" rx="2" /><path d="M12 7v7M9 11l3 3 3-3" /></svg>
                  </span>
                  <span className="you-sheet-row-label">Install the Inkwell app</span>
                </button>
                {iosHelp && (
                  <p className="you-sheet-ios-help">
                    In Safari, tap <strong>Share</strong>{" "}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Share icon" style={{ display: "inline", verticalAlign: "-2px" }}><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></svg>
                    {" "}then <strong>Add to Home Screen</strong>. Inkwell opens full-screen, with notifications and a badge on the icon.
                  </p>
                )}
              </>
            )}
            <Row href="/settings" label="Settings" icon={<SettingsIcon size={20} />} />
            <Row href="/settings/invite" label="Invite friends" icon={<InviteIcon size={20} />} />
            <Row href="/help" label="Help" icon={<HelpIcon size={20} />} />
            {isAdmin && <Row href="/admin" label="Admin" icon={<AdminIcon size={20} />} />}
            <form action="/auth/signout" method="POST">
              <button type="submit" className="you-sheet-row you-sheet-row--quiet">
                <span className="you-sheet-row-icon" aria-hidden="true"><SignOutIcon size={20} /></span>
                <span className="you-sheet-row-label">Sign out</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

function Tile({ href, label, icon, badge, muted }: { href: string; label: string; icon: React.ReactNode; badge?: number; muted?: boolean }) {
  return (
    <Link href={href} className="you-sheet-tile">
      <span className="you-sheet-tile-icon" aria-hidden="true">
        {icon}
        {badge != null && badge > 0 && (
          <span className={`you-sheet-badge${muted ? " you-sheet-badge--muted" : ""}`}>{badge > 9 ? "9+" : badge}</span>
        )}
      </span>
      <span className="you-sheet-tile-label">{label}</span>
    </Link>
  );
}

function Chip({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <Link href={href} className="you-sheet-chip">
      <span aria-hidden="true">{icon}</span>
      {label}
    </Link>
  );
}

function Row({ href, label, icon, accent }: { href: string; label: string; icon: React.ReactNode; accent?: boolean }) {
  return (
    <Link href={href} className={`you-sheet-row${accent ? " you-sheet-row--accent" : ""}`}>
      <span className="you-sheet-row-icon" aria-hidden="true">{icon}</span>
      <span className="you-sheet-row-label">{label}</span>
    </Link>
  );
}
