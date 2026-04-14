"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { computeAnchor } from "@/lib/marginalia/anchor";
import type { AnchorData } from "@/lib/marginalia/types";

interface ComposeNotePopoverProps {
  rect: DOMRect;
  range: Range;
  proseRoot: HTMLElement | null;
  onCancel: () => void;
  onSubmit: (range: Range, noteHtml: string, anchor: AnchorData) => void | Promise<void>;
}

const MAX_CHARS = 500;

/**
 * Compose a margin note for a captured text selection.
 *
 * Pattern: portaled to body, positioned near the selection rect. Captures
 * the selection Range on mount (getSelection is unreliable once focus
 * moves to the textarea) and derives the AnchorData at submit time.
 */
export function ComposeNotePopover({
  rect,
  range,
  proseRoot,
  onCancel,
  onSubmit,
}: ComposeNotePopoverProps) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Focus the textarea after mount
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        submit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  async function submit() {
    const trimmed = text.trim();
    if (!trimmed || submitting) return;
    if (!proseRoot) {
      onCancel();
      return;
    }
    setSubmitting(true);
    try {
      const anchor = computeAnchor(proseRoot, range);
      // Wrap in <p> so it matches the HTML sanitizer's expectations
      const noteHtml = `<p>${escapeHtml(trimmed)}</p>`;
      await onSubmit(range, noteHtml, anchor);
    } finally {
      setSubmitting(false);
    }
  }

  if (!mounted) return null;

  // Position the popover below the selection, or above if there's no room
  const POPOVER_WIDTH = 320;
  const POPOVER_HEIGHT_ESTIMATE = 180;
  const pageYOffset = window.scrollY;
  const viewportHeight = window.innerHeight;

  let top = rect.bottom + pageYOffset + 8;
  if (rect.bottom + POPOVER_HEIGHT_ESTIMATE > viewportHeight) {
    top = rect.top + pageYOffset - POPOVER_HEIGHT_ESTIMATE - 8;
  }
  let left = rect.left + rect.width / 2 - POPOVER_WIDTH / 2;
  if (left < 12) left = 12;
  if (left + POPOVER_WIDTH > window.innerWidth - 12) {
    left = window.innerWidth - POPOVER_WIDTH - 12;
  }

  const popover = (
    <div
      className="marginalia-compose-popover"
      role="dialog"
      aria-label="Leave a note about this passage"
      style={{
        position: "absolute",
        top,
        left,
        width: POPOVER_WIDTH,
        zIndex: 70,
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
        placeholder="Leave a note about this passage…"
        rows={4}
        maxLength={MAX_CHARS}
        className="marginalia-compose-textarea"
      />
      <div className="marginalia-compose-footer">
        <span className="marginalia-compose-count">
          {text.length} / {MAX_CHARS}
        </span>
        <div className="marginalia-compose-buttons">
          <button type="button" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || text.trim().length === 0}
            className="marginalia-compose-submit"
          >
            {submitting ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      <div className="marginalia-compose-hint">⌘↵ to save · Esc to cancel</div>
    </div>
  );

  return createPortal(popover, document.body);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
