"use client";

import { useEffect, useId, useRef, useState } from "react";

export interface TopicItem {
  label: string;
  href: string;
  active: boolean;
}

// Explore's topics (the 21 categories) behind one button, so they don't take
// a row of their own above the book. Links are built on the server; each is a
// plain <a> for the same reason as FilterLink (Next's router cache served
// stale results when only the query string changed).
export function TopicMenu({ items }: { items: TopicItem[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const active = items.find((i) => i.active && i.label !== "All topics");

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="topic-menu">
      <button
        ref={buttonRef}
        type="button"
        className={`topic-menu-button${active ? " is-active" : ""}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{active ? active.label : "Topics"}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="topic-menu-chevron">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div id={panelId} className="topic-menu-panel" role="menu">
          {items.map((i) => (
            <a
              key={i.href}
              href={i.href}
              role="menuitem"
              className={`topic-menu-item${i.active ? " is-active" : ""}`}
              aria-current={i.active ? "page" : undefined}
            >
              {i.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
