"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import { getMarkRange } from "@tiptap/core";

// The link box: opened from the toolbar, the selection menu or ⌘K. It
// replaces window.prompt(), which looked like an error dialog, couldn't show
// what the link already was in a useful way, and had no "remove".

/** Turns what a writer types into a link: "example.com" → https://example.com. */
export function normalizeLink(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^(javascript|data|vbscript):/i.test(value)) return null;
  if (/^(https?:|mailto:|tel:)/i.test(value) || value.startsWith("/") || value.startsWith("#")) return value;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return `mailto:${value}`;
  if (/\s/.test(value)) return null;
  return `https://${value}`;
}

function displayText(href: string): string {
  return href.replace(/^mailto:/i, "").replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

export function LinkPopover({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  // What the box is about: the selection when it opened, or the whole link
  // when the cursor was inside one. Worked out without moving the selection,
  // so closing the box leaves everything as it was.
  const [target] = useState(() => {
    const { from, to, empty, $from } = editor.state.selection;
    const existing = editor.getAttributes("link").href as string | undefined;
    const linkType = editor.schema.marks.link;
    const range = existing && linkType ? getMarkRange($from, linkType) : undefined;
    if (existing && range) {
      return { from: range.from, to: range.to, empty: false, existing };
    }
    return { from, to, empty, existing: undefined as string | undefined };
  });
  const [value, setValue] = useState(target.existing ?? "");
  const [error, setError] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    const place = () => {
      try {
        const start = editor.view.coordsAtPos(target.from);
        const width = Math.min(360, window.innerWidth - 16);
        const left = Math.max(8, Math.min(start.left, window.innerWidth - width - 8));
        const height = boxRef.current?.offsetHeight ?? 52;
        const top = start.bottom + 8 + height > window.innerHeight - 8 ? start.top - 8 - height : start.bottom + 8;
        setPos({ top: Math.max(8, top), left });
      } catch {
        /* position unavailable; stay hidden */
      }
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [editor, target.from]);

  // Focus once it's placed: while it's still hidden (before the first
  // measurement) the browser ignores focus().
  const focusedRef = useRef(false);
  useEffect(() => {
    if (!pos || focusedRef.current) return;
    focusedRef.current = true;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [pos]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [onClose]);

  const close = (refocus = true) => {
    onClose();
    if (refocus) editor.commands.focus();
  };

  const apply = () => {
    if (!value.trim()) {
      if (target.existing) remove();
      else close();
      return;
    }
    const href = normalizeLink(value);
    if (!href) {
      setError(true);
      return;
    }
    if (target.empty) {
      editor
        .chain()
        .focus()
        .insertContentAt(target.from, {
          type: "text",
          text: displayText(href),
          marks: [{ type: "link", attrs: { href } }],
        })
        .run();
    } else {
      editor
        .chain()
        .focus()
        .setTextSelection({ from: target.from, to: target.to })
        .setLink({ href })
        .setTextSelection(target.to)
        .run();
    }
    onClose();
  };

  const remove = () => {
    editor
      .chain()
      .focus()
      .setTextSelection({ from: target.from, to: target.to })
      .unsetLink()
      .setTextSelection(target.to)
      .run();
    onClose();
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={boxRef}
      className="link-popover"
      role="dialog"
      aria-label={target.existing ? "Edit link" : "Add a link"}
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, visibility: pos ? "visible" : "hidden" }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
        className="link-popover-row"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="link-popover-icon">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              close();
            }
          }}
          placeholder={target.empty ? "Paste or type a link" : "Link the selected words to…"}
          aria-label="Link address"
          aria-invalid={error}
          className="link-popover-input"
        />
        <button type="submit" className="link-popover-apply">
          {target.existing ? "Update" : "Link"}
        </button>
        {target.existing && (
          <>
            <a href={target.existing} target="_blank" rel="noopener noreferrer" className="link-popover-btn"
              title="Open the link in a new tab" aria-label="Open the link in a new tab">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
            <button type="button" onClick={remove} className="link-popover-btn" title="Remove the link" aria-label="Remove the link">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18.84 12.25l1.72-1.71a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M5.16 11.75l-1.72 1.71a5 5 0 0 0 7.07 7.07l1.72-1.71" />
                <line x1="2" y1="2" x2="22" y2="22" />
              </svg>
            </button>
          </>
        )}
      </form>
      {error && <p className="link-popover-error">That doesn&rsquo;t look like a web address.</p>}
    </div>,
    document.body,
  );
}
