"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Things you can click or type in. A drag never starts on one of these, so
 * picking up a box by its paper never steals a click from a button or the
 * text field inside it.
 */
const INTERACTIVE =
  'textarea, input, select, button, a[href], label, [contenteditable="true"], [role="button"], [role="radio"], [role="option"], .ProseMirror, [data-no-drag]';

/**
 * Lets a floating box (the sticky composer, the reply popup) be picked up and
 * moved, so a reader can see what's underneath it. Returns an `offset` to
 * apply as a CSS `translate` and an `onPointerDown` to put on the box. With
 * `handle` (a selector) only that part picks the box up. The box is kept at
 * least `keepVisible` px on screen.
 */
export function useMovableBox(
  open: boolean,
  opts: { keepVisible?: number; handle?: string } = {}
) {
  const keepVisible = opts.keepVisible ?? 64;
  const handle = opts.handle;
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{
    id: number;
    sx: number;
    sy: number;
    ox: number;
    oy: number;
    rect: DOMRect;
    moved: boolean;
  } | null>(null);

  // Each time the box opens it starts where it normally sits.
  useEffect(() => {
    if (open) setOffset({ x: 0, y: 0 });
  }, [open]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest(INTERACTIVE)) return;
      if (handle && !target.closest(handle)) return;
      const box = e.currentTarget;
      drag.current = {
        id: e.pointerId,
        sx: e.clientX,
        sy: e.clientY,
        ox: offset.x,
        oy: offset.y,
        rect: box.getBoundingClientRect(),
        moved: false,
      };

      const move = (ev: PointerEvent) => {
        const d = drag.current;
        if (!d || ev.pointerId !== d.id) return;
        let dx = ev.clientX - d.sx;
        let dy = ev.clientY - d.sy;
        if (!d.moved && Math.hypot(dx, dy) < 4) return;
        if (!d.moved) {
          d.moved = true;
          setDragging(true);
          // Don't select text while dragging the paper around.
          window.getSelection()?.removeAllRanges();
        }
        ev.preventDefault();
        // Keep part of the box on screen so it can always be grabbed again.
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const r = d.rect;
        dx = Math.max(keepVisible - r.right, Math.min(dx, vw - keepVisible - r.left));
        dy = Math.max(-r.top, Math.min(dy, vh - keepVisible - r.top));
        setOffset({ x: d.ox + dx, y: d.oy + dy });
      };
      const up = (ev: PointerEvent) => {
        const d = drag.current;
        if (!d || ev.pointerId !== d.id) return;
        drag.current = null;
        setDragging(false);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
      };
      window.addEventListener("pointermove", move, { passive: false });
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    },
    [offset.x, offset.y, keepVisible, handle]
  );

  const reset = useCallback(() => setOffset({ x: 0, y: 0 }), []);
  const moved = offset.x !== 0 || offset.y !== 0;

  return { offset, dragging, moved, onPointerDown, reset };
}

/**
 * Closes a box when someone taps or clicks outside it, without blocking the
 * page: scrolling (wheel, trackpad, a finger sliding) passes straight through
 * to the page behind, and only a real click elsewhere closes the box. That
 * click is swallowed, so it closes the box rather than also following a link.
 */
export function useCloseOnOutsideClick(
  refs: Array<React.RefObject<HTMLElement | null>>,
  open: boolean,
  onClose: () => void
) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const refsRef = useRef(refs);
  refsRef.current = refs;

  useEffect(() => {
    if (!open) return;
    const inside = (t: EventTarget | null) =>
      t instanceof Node && refsRef.current.some((r) => r.current?.contains(t));
    // A click is only "outside" if it also started outside: dragging a
    // selection or the box itself and letting go elsewhere isn't a click away.
    let downOutside = false;
    const onDown = (e: PointerEvent) => {
      downOutside = !inside(e.target);
    };
    const onClick = (e: MouseEvent) => {
      if (!downOutside || inside(e.target)) return;
      downOutside = false;
      e.preventDefault();
      e.stopPropagation();
      onCloseRef.current();
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("click", onClick, true);
    };
  }, [open]);
}
