"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LATEST_WHATS_NEW_ID, WHATS_NEW } from "@/lib/whats-new";

// Which "What's new" item a member has last seen. Kept in their settings
// (`whats_new_seen`) so it follows them between devices, with localStorage as
// the fast path. Every surface listens for the same event, so opening the page
// clears the sidebar dot and the Feed notice at once.

const STORAGE_KEY = "inkwell-whats-new-seen";
const SEEN_EVENT = "inkwell-whats-new-seen";

function readLocal(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function markWhatsNewSeen() {
  try {
    localStorage.setItem(STORAGE_KEY, LATEST_WHATS_NEW_ID);
  } catch {}
  window.dispatchEvent(new Event(SEEN_EVENT));
  fetch("/api/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ settings: { whats_new_seen: LATEST_WHATS_NEW_ID } }),
  }).catch(() => {});
}

/** True once mounted if the newest item hasn't been seen. False on the server. */
export function useWhatsNewUnread(serverSeen?: string | null): boolean {
  const [unread, setUnread] = useState(false);

  useEffect(() => {
    const check = () => {
      const seen = readLocal() ?? serverSeen ?? null;
      setUnread(seen !== LATEST_WHATS_NEW_ID && serverSeen !== LATEST_WHATS_NEW_ID);
    };
    check();
    window.addEventListener(SEEN_EVENT, check);
    return () => window.removeEventListener(SEEN_EVENT, check);
  }, [serverSeen]);

  return unread;
}

/** Mounted on /whats-new: visiting the page counts as seeing it. */
export function MarkWhatsNewSeen() {
  useEffect(() => {
    markWhatsNewSeen();
  }, []);
  return null;
}

/** The small dot beside "What's new" in navigation. */
export function WhatsNewDot({ serverSeen }: { serverSeen?: string | null }) {
  const unread = useWhatsNewUnread(serverSeen);
  if (!unread) return null;
  return <span className="whats-new-dot" aria-label="New features" />;
}

/**
 * A one-line notice at the top of Feed when something new has shipped since
 * the member last looked. Dismissing it counts as seen.
 */
export function WhatsNewNotice({ serverSeen }: { serverSeen?: string | null }) {
  const unread = useWhatsNewUnread(serverSeen);
  if (!unread) return null;

  const seen = readLocal() ?? serverSeen ?? null;
  const seenIndex = seen ? WHATS_NEW.findIndex((i) => i.id === seen) : -1;
  const fresh = seenIndex === -1 ? WHATS_NEW.length : seenIndex;
  const latest = WHATS_NEW[0];

  return (
    <div className="whats-new-notice" role="status">
      <span className="whats-new-notice-label">New on Inkwell</span>
      <span className="whats-new-notice-text">
        {latest.title}
        {fresh > 1 && <span style={{ color: "var(--muted)" }}> · and {Math.min(fresh, WHATS_NEW.length) - 1} more</span>}
      </span>
      <Link href="/whats-new" className="whats-new-notice-link">
        See what&rsquo;s new →
      </Link>
      <button
        type="button"
        onClick={markWhatsNewSeen}
        className="whats-new-notice-close"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
