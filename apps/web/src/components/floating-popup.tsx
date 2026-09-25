"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";

interface FloatingPopupProps {
  /** Ref to the element the popup anchors to */
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Where to show relative to anchor — "top" opens upward, "bottom" opens downward */
  placement?: "top" | "bottom";
  className?: string;
  style?: React.CSSProperties;
}

export function FloatingPopup({
  anchorRef,
  open,
  onClose,
  children,
  placement = "top",
  className = "",
  style,
}: FloatingPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: -9999, left: -9999, maxHeight: 9999 });
  const [visible, setVisible] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    const popup = popupRef.current;
    if (!anchor || !popup) return;

    const ar = anchor.getBoundingClientRect();
    const pr = popup.getBoundingClientRect();
    // The part of the screen actually visible. On a phone with the keyboard
    // up that's much less than the window (iOS lays the keyboard over the
    // page), and a popup positioned against the full window hid behind it.
    const vv = window.visualViewport;
    const minX = (vv?.offsetLeft ?? 0) + 8;
    const minY = (vv?.offsetTop ?? 0) + 8;
    const maxX = (vv ? vv.offsetLeft + vv.width : window.innerWidth) - 8;
    const maxY = (vv ? vv.offsetTop + vv.height : window.innerHeight) - 8;

    // Horizontal: try to right-align to anchor, fall back to left-align, clamp
    let left = ar.right - pr.width;
    if (left < minX) left = ar.left;
    left = Math.max(minX, Math.min(left, maxX - pr.width));

    // Vertical
    let top: number;
    if (placement === "top") {
      top = ar.top - pr.height - 8;
      if (top < minY) top = ar.bottom + 8; // flip to bottom
    } else {
      top = ar.bottom + 8;
      if (top + pr.height > maxY) top = ar.top - pr.height - 8; // flip to top
    }

    // Clamp to the visible area so the popup never extends off-screen
    top = Math.max(minY, Math.min(top, maxY - pr.height));

    // Compute max height so content scrolls if it can't fit
    const computedMaxHeight = maxY - top;

    setPos({ top, left, maxHeight: computedMaxHeight });
    setVisible(true);
  }, [anchorRef, placement]);

  // Position on open + update on scroll/resize
  useEffect(() => {
    if (!open) {
      setVisible(false);
      return;
    }

    // Wait for render, then measure & position
    const raf = requestAnimationFrame(() => {
      updatePosition();
    });

    const handleUpdate = () => updatePosition();
    window.addEventListener("scroll", handleUpdate, true);
    window.addEventListener("resize", handleUpdate);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", handleUpdate);
    vv?.addEventListener("scroll", handleUpdate);
    // Content that arrives after opening (comments loading) changes the
    // popup's size; measure again rather than growing over the anchor.
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(handleUpdate) : null;
    if (popupRef.current) ro?.observe(popupRef.current);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCloseRef.current(); };
    window.addEventListener("keydown", onKey);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", handleUpdate, true);
      window.removeEventListener("resize", handleUpdate);
      vv?.removeEventListener("resize", handleUpdate);
      vv?.removeEventListener("scroll", handleUpdate);
      ro?.disconnect();
      window.removeEventListener("keydown", onKey);
    };
  }, [open, updatePosition]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        popupRef.current &&
        !popupRef.current.contains(target) &&
        anchorRef.current &&
        !anchorRef.current.contains(target)
      ) {
        onClose();
      }
    }
    document.addEventListener("pointerdown", handleClick);
    return () => document.removeEventListener("pointerdown", handleClick);
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  // Compute viewport-clamped maxHeight, respecting consumer's maxHeight if smaller
  const clampedMaxHeight = style?.maxHeight
    ? Math.min(Number(style.maxHeight) || pos.maxHeight, pos.maxHeight)
    : pos.maxHeight;

  // Destructure maxHeight out of style so it doesn't override our clamped value
  const { maxHeight: _consumerMaxHeight, ...restStyle } = style ?? {};

  return createPortal(
    <div
      ref={popupRef}
      className={className}
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        zIndex: 9999,
        visibility: visible ? "visible" : "hidden",
        overflowY: "auto",
        maxWidth: "calc(100vw - 16px)",
        ...restStyle,
        maxHeight: clampedMaxHeight,
      }}
    >
      {children}
    </div>,
    document.body
  );
}
