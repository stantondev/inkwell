"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { FloatingPopup } from "@/components/floating-popup";
import { DeleteEntryDialog } from "./delete-entry-dialog";
import styles from "./entry-page.module.css";

const PIN_LIMIT = 3;

/**
 * The writer's own controls on their entry page, kept apart from the reader
 * actions (ink, reprint, bookmark, share): who can read it, how many reads,
 * Edit, and a ⋯ menu with History, Pin and Delete.
 */
export function OwnerStrip({
  entryId,
  username,
  audience,
  readCount,
  initialPinned,
  pinnedCount,
}: {
  entryId: string;
  username: string;
  /** "Public", "Pen pals only", … */
  audience: string;
  readCount?: number | null;
  initialPinned: boolean;
  pinnedCount: number;
}) {
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pinned, setPinned] = useState(initialPinned);
  const [pinCount, setPinCount] = useState(pinnedCount);
  const [pinSaving, setPinSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pinFull = !pinned && pinCount >= PIN_LIMIT;

  async function togglePin() {
    if (pinSaving) return;
    setPinSaving(true);
    setError(null);
    try {
      const meRes = await fetch("/api/me");
      if (!meRes.ok) {
        setError("Couldn't load your pinned entries. Please try again.");
        return;
      }
      const me = await meRes.json();
      const current: string[] = me.data?.pinned_entry_ids ?? [];
      let next: string[];
      if (current.includes(entryId)) {
        next = current.filter((id) => id !== entryId);
      } else {
        if (current.length >= PIN_LIMIT) {
          setPinCount(current.length);
          setError(`You can pin up to ${PIN_LIMIT} entries. Unpin one from your profile first.`);
          return;
        }
        next = [...current, entryId];
      }
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned_entry_ids: next }),
      });
      if (res.ok) {
        setPinned(next.includes(entryId));
        setPinCount(next.length);
        setMenuOpen(false);
      } else {
        setError("Couldn't update your pinned entries. Please try again.");
      }
    } catch {
      setError("Couldn't reach Inkwell. Please try again.");
    } finally {
      setPinSaving(false);
    }
  }

  return (
    <div className={styles.ownerStrip} aria-label="Your entry">
      <div className={styles.ownerFacts}>
        <span className={styles.ownerLabel}>Your entry</span>
        <span aria-hidden="true" className={styles.factSep}>·</span>
        <span className={styles.fact} title="Who can read it">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <span className="sr-only">Who can read it: </span>
          {audience}
        </span>
        {typeof readCount === "number" && (
          <>
            <span aria-hidden="true" className={styles.factSep}>·</span>
            <Link href="/readers" className={styles.factLink} title="Your readers">
              {readCount === 1 ? "1 read" : `${readCount.toLocaleString("en-US")} reads`}
            </Link>
          </>
        )}
        {pinned && (
          <>
            <span aria-hidden="true" className={styles.factSep}>·</span>
            <span className={styles.fact}>Pinned</span>
          </>
        )}
      </div>

      <div className={styles.ownerButtons}>
        <Link href={`/editor?edit=${entryId}`} className={styles.ownerButton}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
          </svg>
          Edit
        </Link>
        <button
          ref={menuButtonRef}
          type="button"
          className={styles.iconButton}
          onClick={() => setMenuOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="More for this entry"
          title="More"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="19" cy="12" r="2" />
          </svg>
        </button>
      </div>

      {error && (
        <p className={styles.ownerError} role="alert">
          {error}
        </p>
      )}

      <FloatingPopup anchorRef={menuButtonRef} open={menuOpen} onClose={() => setMenuOpen(false)} placement="bottom">
        <div className={styles.menu} role="menu" aria-label="Your entry">
          <Link
            href={`/editor/history?entry=${entryId}`}
            className={styles.menuItem}
            role="menuitem"
            onClick={() => setMenuOpen(false)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            Version history
          </Link>
          <button
            type="button"
            className={styles.menuItem}
            role="menuitem"
            onClick={togglePin}
            disabled={pinSaving || pinFull}
            title={pinFull ? `You can pin up to ${PIN_LIMIT} entries` : undefined}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="17" x2="12" y2="22" />
              <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24z" />
            </svg>
            {pinned ? "Unpin from profile" : "Pin to profile"}
            {pinSaving ? (
              <span className={styles.menuHint}>Saving…</span>
            ) : pinFull ? (
              <span className={styles.menuHint}>{PIN_LIMIT} pinned</span>
            ) : null}
          </button>
          <div className={styles.menuDivider} role="separator" />
          <button
            type="button"
            className={styles.menuDanger}
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              setConfirming(true);
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
            Delete entry…
          </button>
        </div>
      </FloatingPopup>

      <DeleteEntryDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        entryId={entryId}
        username={username}
      />
    </div>
  );
}
