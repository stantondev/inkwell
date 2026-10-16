"use client";

import { useEffect } from "react";
import { useDraggable } from "@dnd-kit/core";

import type { ProfileBlockType, ProfileHome } from "@/lib/profile-home";
import { BLOCK_INFO, OWN_BLOCKS, typesOnPage } from "@/lib/home-edit";
import type { ProfileContext } from "@/app/[username]/profile-layout";
import s from "./arrange.module.css";

export const TRAY_PREFIX = "tray:";

const PROFILE_PIECES: ProfileBlockType[] = [
  "pinned", "top_pals", "guestbook", "music", "tags", "series", "newsletter", "support", "rss", "custom_html",
];

/** What can go on the page: pieces of the profile not on it yet, and things to make. */
export function WidgetTray({
  home,
  ctx,
  onAdd,
  onClose,
}: {
  home: ProfileHome;
  ctx: ProfileContext;
  onAdd: (type: ProfileBlockType) => void;
  onClose: () => void;
}) {
  const onPage = typesOnPage(home);
  const pieces = PROFILE_PIECES.filter((t) => !onPage.has(t) && (t !== "custom_html" || ctx.isPlus));
  const own = OWN_BLOCKS.filter((t) => t !== "now" || !onPage.has("now"));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside className={s.tray} aria-label="Add to your page">
      <div className={s.trayHead}>
        <h2>Add to your page</h2>
        <button type="button" className={s.iconBtn} onClick={onClose} aria-label="Close">✕</button>
      </div>
      <p className={s.trayHint}>Pick one to add it to the column you last chose, or drag it onto your page.</p>

      <h3 className={s.trayHeading}>Make something</h3>
      <div className={s.trayGrid}>
        {own.map((t) => <TrayItem key={t} type={t} onAdd={onAdd} />)}
      </div>

      <h3 className={s.trayHeading}>From your profile</h3>
      {pieces.length > 0 ? (
        <div className={s.trayGrid}>
          {pieces.map((t) => <TrayItem key={t} type={t} onAdd={onAdd} />)}
        </div>
      ) : (
        <p className={s.trayHint}>Everything from your profile is on your page.</p>
      )}
    </aside>
  );
}

function TrayItem({ type, onAdd }: { type: ProfileBlockType; onAdd: (type: ProfileBlockType) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: TRAY_PREFIX + type });
  const info = BLOCK_INFO[type];
  return (
    <div ref={setNodeRef} className={`${s.trayItem} ${isDragging ? s.trayItemDragging : ""}`}>
      <button type="button" className={s.trayAdd} onClick={() => onAdd(type)}>
        <span className={s.trayIcon} aria-hidden="true">{ICONS[type] ?? "▢"}</span>
        <span>
          <strong>{info.label}</strong>
          <span>{info.blurb}</span>
        </span>
      </button>
      <button type="button" className={s.trayGrip} aria-label={`Drag ${info.label} onto your page`} {...attributes} {...listeners}>
        <svg width="12" height="16" viewBox="0 0 12 16" aria-hidden="true"><g fill="currentColor"><circle cx="3" cy="3" r="1.4" /><circle cx="9" cy="3" r="1.4" /><circle cx="3" cy="8" r="1.4" /><circle cx="9" cy="8" r="1.4" /><circle cx="3" cy="13" r="1.4" /><circle cx="9" cy="13" r="1.4" /></g></svg>
      </button>
    </div>
  );
}

const ICONS: Partial<Record<ProfileBlockType, string>> = {
  note: "✎",
  photo: "▣",
  quote: "❝",
  now: "☕",
  countdown: "⏳",
  links: "↗",
  divider: "〰",
  pinned: "📌",
  top_pals: "✉",
  guestbook: "✍",
  music: "♪",
  tags: "#",
  series: "☰",
  newsletter: "✉",
  support: "♥",
  rss: "◉",
  custom_html: "</>",
};
