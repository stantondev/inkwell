"use client";

import { useRef, useState } from "react";

/**
 * Double-tap a page to ink it (mobile reader).
 *
 * This replaced vertical swipe-up-to-ink / swipe-down-to-bookmark, which could
 * never work reliably: on the mobile reader, horizontal swipes turn pages and
 * vertical swipes scroll the entry, so there was no free direction left. Chrome
 * claimed the vertical drag for scrolling and cancelled the touch before the
 * gesture finished, and swipe-down at the top of the page also fired
 * pull-to-refresh.
 *
 * A double-tap only ever adds an ink, never removes one, so a stray double-tap
 * can't undo something. Taps on links, buttons, form fields and media are
 * left alone.
 */

const DOUBLE_TAP_MS = 320;
const MAX_TAP_MS = 350;
const MAX_TAP_MOVE = 12;
const MAX_TAP_GAP = 40;

const INTERACTIVE =
  "a, button, input, textarea, select, label, summary, iframe, video, audio, [role='button'], [role='link'], [contenteditable='true'], .sticky-note-actions";

interface Splash {
  key: number;
  x: number;
  y: number;
}

export function DoubleTapInk({
  children,
  onInk,
}: {
  children: React.ReactNode;
  /** Called on a double-tap. The caller decides whether an ink is actually sent. */
  onInk: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const down = useRef<{ x: number; y: number; t: number } | null>(null);
  const lastTap = useRef<{ x: number; y: number; t: number } | null>(null);
  const [splashes, setSplashes] = useState<Splash[]>([]);

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === "mouse") return;
    down.current = { x: e.clientX, y: e.clientY, t: e.timeStamp };
  }

  function onPointerUp(e: React.PointerEvent) {
    const start = down.current;
    down.current = null;
    if (!start || e.pointerType === "mouse") return;

    const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
    const isTap = moved < MAX_TAP_MOVE && e.timeStamp - start.t < MAX_TAP_MS;
    if (!isTap || (e.target as HTMLElement).closest(INTERACTIVE)) {
      lastTap.current = null;
      return;
    }

    const prev = lastTap.current;
    if (prev && e.timeStamp - prev.t < DOUBLE_TAP_MS && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < MAX_TAP_GAP) {
      lastTap.current = null;
      // Some browsers select the word under a double-tap; that's not what was meant.
      try { window.getSelection()?.removeAllRanges(); } catch { /* ignore */ }
      const rect = wrapRef.current?.getBoundingClientRect();
      if (rect) {
        const key = e.timeStamp;
        setSplashes((s) => [...s, { key, x: e.clientX - rect.left, y: e.clientY - rect.top }]);
        setTimeout(() => setSplashes((s) => s.filter((x) => x.key !== key)), 800);
      }
      try { navigator.vibrate?.(12); } catch { /* not supported */ }
      onInk();
      return;
    }
    lastTap.current = { x: e.clientX, y: e.clientY, t: e.timeStamp };
  }

  return (
    <div
      ref={wrapRef}
      className="double-tap-ink"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { down.current = null; }}
    >
      {children}
      {splashes.map((s) => (
        <span key={s.key} className="double-tap-ink-splash" style={{ left: s.x, top: s.y }} aria-hidden="true">
          <svg width="64" height="78" viewBox="0 0 16 20" fill="currentColor">
            <path d="M8 1C8 1 1 8.5 1 12.5a7 7 0 0 0 14 0C15 8.5 8 1 8 1Z" />
          </svg>
        </span>
      ))}
    </div>
  );
}
