"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Clicks on these keep doing their own thing.
const INTERACTIVE =
  "a, button, input, textarea, select, label, summary, iframe, video, audio, [role='button'], [role='link'], [role='dialog'], [contenteditable='true']";

// The mobile feed inks a post on a double-tap (DoubleTapInk), so a tap waits
// this long for a second one before opening the sticky.
const DOUBLE_TAP_MS = 330;

/**
 * Makes a whole sticky open its page, not just the timestamp (roadmap: "Make
 * entire sticky clickable"). Links and buttons inside it, selecting text, and
 * clicks inside popups opened from it (portaled elsewhere, but React still
 * bubbles them here) are left alone. ⌘/Ctrl-click opens a new tab. Keyboard
 * users still have the timestamp link.
 */
export function StickyClickArea({
  href,
  className,
  style,
  readId,
  label,
  children,
}: {
  href: string;
  className: string;
  style?: React.CSSProperties;
  readId?: string;
  label: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pointerType = useRef<string>("mouse");
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTap = useRef(0);

  useEffect(() => () => { if (pending.current) clearTimeout(pending.current); }, []);

  function onClick(e: React.MouseEvent<HTMLElement>) {
    const target = e.target as Node;
    if (e.defaultPrevented || e.button !== 0) return;
    if (!e.currentTarget.contains(target)) return;
    if (target instanceof Element && target.closest(INTERACTIVE)) return;

    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && e.currentTarget.contains(selection.anchorNode)) return;

    if (e.metaKey || e.ctrlKey || e.shiftKey) {
      window.open(href, "_blank", "noopener");
      return;
    }

    if (pointerType.current === "mouse") {
      router.push(href);
      return;
    }

    // Touch: a second tap means a double-tap (ink), not "open".
    const now = e.timeStamp;
    if (pending.current && now - lastTap.current < DOUBLE_TAP_MS) {
      clearTimeout(pending.current);
      pending.current = null;
      return;
    }
    lastTap.current = now;
    pending.current = setTimeout(() => {
      pending.current = null;
      router.push(href);
    }, DOUBLE_TAP_MS);
  }

  return (
    <article
      className={`${className} sticky-note--clickable`}
      data-read-entry={readId}
      style={style}
      aria-label={label}
      onPointerDown={(e) => { pointerType.current = e.pointerType || "mouse"; }}
      onClick={onClick}
    >
      {children}
    </article>
  );
}
