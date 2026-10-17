"use client";

/**
 * StampDisplay — the stamps on a post, as an envelope corner: up to five
 * impressions overlapping, each at its own slight tilt, the newest on top
 * with its postmark. Hover or tap lists the designs and the days they were
 * stamped. Readers never see who sent them; the writer does, on the entry page.
 */

import { useEffect, useRef, useState } from "react";
import { FloatingPopup } from "./floating-popup";
import { StampArt } from "./stamp-art";
import { StampImpression } from "./stamp-impression";
import { STAMP_WIDTHS, type StampSize } from "./stamp-frame";
import { formatStampDay, marksFromTypes, stampInfo, type StampMark } from "./stamp-config";
import { useStampState } from "@/lib/stamp-state";

interface StampDisplayProps {
  stamps?: string[] | null;
  marks?: StampMark[] | null;
  /** Listen for stamps sent from this entry's picker. */
  entryId?: string;
  size?: StampSize;
  /** Show the hover/tap list of designs. */
  showPopup?: boolean;
  /** Most impressions to draw. */
  max?: number;
  /** Clicking the cluster does this instead of opening the list (the writer's view). */
  onOpen?: () => void;
  openLabel?: string;
}

export function stampMarkLine(mark: StampMark, short = true): string {
  const info = stampInfo(mark.type);
  const parts = [info?.label ?? "Stamp"];
  if (mark.type === "abroad" && mark.domain) parts.push(`from ${mark.domain}`);
  else if (info) parts.push(info.description);
  const day = formatStampDay(mark.stamped_on, short);
  if (day) parts.push(day);
  return parts.join(" · ");
}

export function StampDisplay({
  stamps,
  marks: initialMarks,
  entryId,
  size = "md",
  showPopup = true,
  max = 5,
  onOpen,
  openLabel,
}: StampDisplayProps) {
  const [marks, setMarks] = useState<StampMark[]>(
    initialMarks && initialMarks.length > 0 ? initialMarks : marksFromTypes(stamps)
  );
  const [pressed, setPressed] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMarks(initialMarks && initialMarks.length > 0 ? initialMarks : marksFromTypes(stamps));
    // Only when the server copy changes, not on every render's new array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(initialMarks ?? null), JSON.stringify(stamps ?? null)]);

  useStampState(entryId, (patch) => {
    setMarks(patch.stamp_marks?.length ? patch.stamp_marks : marksFromTypes(patch.stamps));
    setPressed(patch.pressed ?? null);
  });

  useEffect(() => {
    if (!pressed) return;
    const t = setTimeout(() => setPressed(null), 1200);
    return () => clearTimeout(t);
  }, [pressed]);

  if (marks.length === 0) return null;

  const width = STAMP_WIDTHS[size];
  // Oldest first in the DOM, so the newest lands on top, furthest right.
  const shown = marks.slice(0, max).reverse();
  const names = Array.from(new Set(marks.map((m) => stampInfo(m.type)?.label ?? "Stamp")));
  const label = openLabel ?? `Stamps on this entry: ${names.join(", ")}`;
  const interactive = showPopup || !!onOpen;

  const cluster = shown.map((mark, i) => (
    <StampImpression
      key={mark.id}
      mark={mark}
      width={width}
      pressed={pressed === mark.id}
      postmark={i === shown.length - 1 ? (mark.stamped_on ? "full" : "lines") : "none"}
      style={i > 0 ? { marginLeft: -Math.round(width * 0.5) } : undefined}
    />
  ));

  if (!interactive) {
    return (
      <div className="stamp-cluster" data-size={size} role="img" aria-label={label}>
        {cluster}
      </div>
    );
  }

  return (
    <>
      <button
        ref={ref}
        type="button"
        className="stamp-cluster stamp-cluster-button"
        data-size={size}
        aria-label={label}
        aria-expanded={onOpen ? undefined : open}
        onMouseEnter={(e) => {
          if (!onOpen && showPopup && window.matchMedia("(hover: hover)").matches) setOpen(true);
          void e;
        }}
        onMouseLeave={() => {
          if (!onOpen && window.matchMedia("(hover: hover)").matches) setOpen(false);
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (onOpen) onOpen();
          else setOpen((v) => !v);
        }}
      >
        {cluster}
      </button>
      {showPopup && !onOpen && (
        <FloatingPopup
          anchorRef={ref}
          open={open}
          onClose={() => setOpen(false)}
          placement="bottom"
          className="stamp-list-popup rounded-xl border shadow-lg"
          style={{ background: "var(--surface)", borderColor: "var(--border)", width: "min(300px, calc(100vw - 24px))" }}
        >
          <p className="stamp-list-title">Postage on this page</p>
          <ul className="stamp-list">
            {marks.map((m) => (
              <li key={m.id} className="stamp-list-row">
                <StampArt type={m.type} width={26} emoji={m.emoji} emojiUrl={m.emoji_url} />
                <span>{stampMarkLine(m)}</span>
              </li>
            ))}
          </ul>
        </FloatingPopup>
      )}
    </>
  );
}
