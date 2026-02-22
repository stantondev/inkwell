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
  const [pos, setPos] = useState({ top: -9999, left: -9999 });
  const [visible, setVisible] = useState(false);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    const popup = popupRef.current;
    if (!anchor || !popup) return;

    const ar = anchor.getBoundingClientRect();
    const pr = popup.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Horizontal: try to right-align to anchor, fall back to left-align, clamp
    let left = ar.right - pr.width;
    if (left < 8) left = ar.left;
    left = Math.max(8, Math.min(left, vw - pr.width - 8));

    // Vertical
    let top: number;
    if (placement === "top") {
      top = ar.top - pr.height - 8;
      if (top < 8) top = ar.bottom + 8; // flip to bottom
    } else {
      top = ar.bottom + 8;
      if (top + pr.height > vh - 8) top = ar.top - pr.height - 8; // flip to top
    }

    setPos({ top, left });
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

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", handleUpdate, true);
      window.removeEventListener("resize", handleUpdate);
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
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, onClose, anchorRef]);

  if (!open) return null;

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
        ...style,
      }}
    >
      {children}
    </div>,
    document.body
  );
}
