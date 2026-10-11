"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FloatingPopup } from "@/components/floating-popup";
import { LocalDate, SHORT_DATE } from "@/components/local-date";
import { decodeEntities } from "@/lib/decode-entities";
import { readingTimeLabel } from "@/lib/reading-time";
import type { DraftEntry } from "./draft-types";
import styles from "./drafts.module.css";

const PRIVACY_LABELS: Record<string, string> = {
  public: "Public",
  friends_only: "Pen pals",
  private: "Only me",
  custom: "Custom list",
  circle: "Circle",
};

const SCHEDULE_FORMAT: Omit<Intl.DateTimeFormatOptions, "timeZone"> = {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

// Fixed locale so the server and the browser print the same number.
const NUMBER = new Intl.NumberFormat("en-US");

/**
 * "Edited 3 hours ago". `now` is null on the server and the first client
 * render, which then show a fixed UTC date, so hydration matches; the
 * relative wording appears straight after.
 */
function editedLabel(iso: string, now: number | null): string {
  const then = new Date(iso);
  if (now === null) {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(then);
  }
  const mins = Math.floor((now - then.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} ${mins === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 2) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const sameYear = then.getFullYear() === new Date(now).getFullYear();
  return new Intl.DateTimeFormat("en-US", sameYear
    ? { month: "short", day: "numeric" }
    : { month: "short", day: "numeric", year: "numeric" }).format(then);
}

export function DraftRow({
  draft,
  selected,
  now,
  onToggle,
  onDelete,
}: {
  draft: DraftEntry;
  selected: boolean;
  now: number | null;
  onToggle: (id: string) => void;
  onDelete: (draft: DraftEntry) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLAnchorElement>(null);

  // Move focus into the menu once it has been positioned (it's hidden until
  // then, and hidden elements can't take focus).
  useEffect(() => {
    if (!menuOpen) return;
    const t = setTimeout(() => firstItemRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [menuOpen]);

  const title = decodeEntities(draft.title ?? "").trim();
  const opening = (draft.preview_text?.trim() || decodeEntities(draft.excerpt ?? "").trim());
  const firstLine = opening.split("\n").find((line) => line.trim())?.trim() ?? "";

  const words = draft.word_count ?? 0;
  const isSticky = draft.kind === "sticky";
  const datedInPast =
    !draft.scheduled_at && draft.published_at && now !== null && Date.parse(draft.published_at) < now;
  const titleId = `draft-title-${draft.id}`;

  return (
    <li className={`${styles.row} ${selected ? styles.rowSelected : ""}`}>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(draft.id)}
          aria-labelledby={titleId}
        />
      </label>

      <div className={styles.rowBody}>
        <Link href={`/editor?edit=${draft.id}`} className={styles.rowLink}>
          {title ? (
            <span id={titleId} className={styles.title}>{title}</span>
          ) : firstLine ? (
            <span id={titleId} className={`${styles.title} ${styles.titleUntitled}`}>{firstLine}</span>
          ) : (
            <span id={titleId} className={`${styles.title} ${styles.titleUntitled}`}>
              Untitled draft · <LocalDate iso={draft.created_at} options={SHORT_DATE} asTime={false} />
            </span>
          )}
        </Link>

        {title && opening && <p className={styles.snippet}>{opening}</p>}

        <div className={styles.meta}>
          {draft.scheduled_at && (
            <span className={`${styles.pill} ${styles.pillScheduled}`}>
              Scheduled ·&nbsp;<LocalDate iso={draft.scheduled_at} options={SCHEDULE_FORMAT} />
            </span>
          )}
          {isSticky && <span className={styles.pill}>Sticky</span>}
          {draft.entry_source === "import" && <span className={styles.pill}>Imported</span>}
          {words > 0 && (
            <span>
              {NUMBER.format(words)} {words === 1 ? "word" : "words"} · {readingTimeLabel(words)}
            </span>
          )}
          <span>
            Edited <time dateTime={draft.updated_at}>{editedLabel(draft.updated_at, now)}</time>
          </span>
          <span>{PRIVACY_LABELS[draft.privacy] ?? draft.privacy}</span>
          {datedInPast && draft.published_at && (
            <span>
              Dated <LocalDate iso={draft.published_at} options={SHORT_DATE} />
            </span>
          )}
        </div>
      </div>

      {draft.cover_image_id && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/images/${draft.cover_image_id}`}
          alt=""
          loading="lazy"
          className={styles.thumb}
        />
      )}

      <button
        ref={menuButtonRef}
        type="button"
        className={styles.menuButton}
        onClick={() => setMenuOpen((open) => !open)}
        aria-label={`More for ${title || firstLine || "untitled draft"}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>

      <FloatingPopup
        anchorRef={menuButtonRef}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        placement="bottom"
        className={styles.menu}
      >
        <div role="menu" aria-label="Draft actions">
          <Link
            ref={firstItemRef}
            href={`/editor?edit=${draft.id}`}
            role="menuitem"
            className={styles.menuItem}
            onClick={() => setMenuOpen(false)}
          >
            Edit
          </Link>
          <Link
            href={`/preview/${draft.id}`}
            role="menuitem"
            className={styles.menuItem}
            onClick={() => setMenuOpen(false)}
          >
            Preview
          </Link>
          <button
            type="button"
            role="menuitem"
            className={`${styles.menuItem} ${styles.menuItemDanger}`}
            onClick={() => {
              setMenuOpen(false);
              onDelete(draft);
            }}
          >
            Delete…
          </button>
        </div>
      </FloatingPopup>
    </li>
  );
}
