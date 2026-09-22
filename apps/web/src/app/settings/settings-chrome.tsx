"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  SETTINGS_CATALOG,
  SETTINGS_GROUPS,
  entryForPath,
  groupTitle,
  matchesQuery,
} from "./settings-catalog";

/**
 * The header on every settings page except the overview: where you are, the
 * way back, and a ⌘K switcher so you can jump anywhere without returning to
 * the index first. Replaces the old fixed 220px rail, which cost a column of
 * width on desktop and vanished entirely below 768px.
 */
export function SettingsChrome() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const entry = useMemo(() => entryForPath(pathname), [pathname]);

  // ⌘K / Ctrl+K anywhere in settings opens the switcher.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The overview page is its own masthead — no chrome above it.
  if (pathname === "/settings") return null;

  return (
    <>
      <div className="set-chrome">
        <nav className="set-crumbs" aria-label="Breadcrumb">
          <Link href="/settings" className="set-crumb-back">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Settings
          </Link>
          {entry && (
            <>
              <span className="set-crumb-sep" aria-hidden="true">/</span>
              <span className="set-crumb-group">{groupTitle(entry.group)}</span>
              <span className="set-crumb-sep" aria-hidden="true">/</span>
              <span className="set-crumb-current" aria-current="page">{entry.title}</span>
            </>
          )}
        </nav>

        <button
          type="button"
          className="set-jump-btn"
          onClick={() => setOpen(true)}
          aria-label="Jump to another setting"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <line x1="20" y1="20" x2="16.65" y2="16.65" />
          </svg>
          <span className="set-jump-label">Jump to…</span>
          <kbd className="set-jump-kbd">⌘K</kbd>
        </button>
      </div>

      {entry && (
        <header className="set-detail-head">
          <span className="set-detail-icon">{entry.icon}</span>
          <div>
            <h1 className="set-detail-title">{entry.title}</h1>
            <p className="set-detail-blurb">{entry.blurb}</p>
          </div>
        </header>
      )}

      {open && (
        <JumpPalette
          onClose={() => setOpen(false)}
          onPick={(href) => {
            setOpen(false);
            router.push(href);
          }}
          currentHref={entry?.href}
        />
      )}
    </>
  );
}

function JumpPalette({
  onClose,
  onPick,
  currentHref,
}: {
  onClose: () => void;
  onPick: (href: string) => void;
  currentHref?: string;
}) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(
    () => SETTINGS_CATALOG.filter((e) => matchesQuery(e, query)),
    [query]
  );

  useEffect(() => {
    inputRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => setCursor(0), [query]);

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const picked = results[cursor];
      if (picked) onPick(picked.href);
    }
  };

  return (
    <div className="set-palette-backdrop" onClick={onClose} role="presentation">
      <div
        className="set-palette"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Jump to a setting"
      >
        <div className="set-palette-input-row">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <line x1="20" y1="20" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            className="set-palette-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Jump to a setting…"
            aria-label="Jump to a setting"
          />
          <kbd className="set-jump-kbd">esc</kbd>
        </div>

        <div className="set-palette-list" ref={listRef}>
          {results.length === 0 && (
            <p className="set-palette-empty">No setting matches that.</p>
          )}
          {SETTINGS_GROUPS.map((group) => {
            const items = results.filter((e) => e.group === group.id);
            if (items.length === 0) return null;
            return (
              <div key={group.id}>
                <div className="set-palette-group">{group.title}</div>
                {items.map((item) => {
                  const index = results.indexOf(item);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-index={index}
                      className={`set-palette-row${index === cursor ? " set-palette-row--on" : ""}${item.href === currentHref ? " set-palette-row--current" : ""}`}
                      onMouseEnter={() => setCursor(index)}
                      onClick={() => onPick(item.href)}
                    >
                      <span className="set-palette-icon">{item.icon}</span>
                      <span className="set-palette-text">
                        <span className="set-palette-title">{item.title}</span>
                        <span className="set-palette-blurb">{item.blurb}</span>
                      </span>
                      {item.href === currentHref && (
                        <span className="set-palette-here">Here</span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
