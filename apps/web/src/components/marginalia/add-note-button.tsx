"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

interface AddNoteButtonProps {
  rect: DOMRect;
  onClick: () => void;
}

/**
 * Floating "Add marginalia" button that appears above the current text
 * selection. Portaled to document.body so it escapes any overflow:hidden
 * ancestor.
 *
 * Uses mousedown + preventDefault to keep iOS Safari from collapsing
 * the selection before our handler runs.
 */
export function AddNoteButton({ rect, onClick }: AddNoteButtonProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  // Position 40px above the top of the selection, center-aligned
  const left = rect.left + rect.width / 2;
  const top = Math.max(12, rect.top + window.scrollY - 42);

  const button = (
    <div
      className="marginalia-add-wrapper"
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: "100%",
        height: 0,
        pointerEvents: "none",
        zIndex: 60,
      }}
    >
      <button
        type="button"
        className="marginalia-add-button"
        style={{
          position: "absolute",
          left,
          top,
          transform: "translate(-50%, 0)",
          pointerEvents: "auto",
        }}
        onMouseDown={(e) => {
          // Prevent the click from collapsing the selection before
          // React handles the onClick
          e.preventDefault();
        }}
        onClick={onClick}
        aria-label="Leave a note about this passage"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
        <span>Leave a note</span>
      </button>
    </div>
  );

  return createPortal(button, document.body);
}
