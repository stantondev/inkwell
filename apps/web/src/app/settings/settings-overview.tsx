"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AvatarWithFrame } from "@/components/avatar-with-frame";
import {
  SETTINGS_CATALOG,
  SETTINGS_GROUPS,
  matchesQuery,
  type SettingsEntry,
} from "./settings-catalog";

interface Props {
  displayName: string;
  username: string;
  avatarUrl: string | null;
  avatarFrame: string | null;
  tier: string;
  foundingNumber: number | null;
  donorStatus: string | null;
  status: Record<string, string | null>;
  initialPinned: string[];
  loadFailed: boolean;
}

const MAX_PINNED = 6;

export function SettingsOverview({
  displayName,
  username,
  avatarUrl,
  avatarFrame,
  tier,
  foundingNumber,
  donorStatus,
  status,
  initialPinned,
  loadFailed,
}: Props) {
  const [query, setQuery] = useState("");
  const [pinned, setPinned] = useState<string[]>(initialPinned);
  const [pinError, setPinError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // "/" focuses search, the way it does everywhere else people search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el as HTMLElement | null)?.isContentEditable;
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const savePinned = useCallback(async (next: string[]) => {
    const previous = pinned;
    setPinned(next);
    setPinError(null);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { pinned_settings: next } }),
      });
      // fetch resolves on 4xx/5xx, so the status has to be checked explicitly
      // or a failed save looks exactly like a successful one.
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setPinned(previous);
      setPinError("Couldn't save that. Check your connection and try again.");
    }
  }, [pinned]);

  const togglePin = useCallback(
    (id: string) => {
      if (pinned.includes(id)) {
        savePinned(pinned.filter((p) => p !== id));
      } else {
        if (pinned.length >= MAX_PINNED) {
          setPinError(`Quick access holds ${MAX_PINNED}. Unpin one to add another.`);
          return;
        }
        savePinned([...pinned, id]);
      }
    },
    [pinned, savePinned]
  );

  const results = useMemo(
    () => SETTINGS_CATALOG.filter((e) => matchesQuery(e, query)),
    [query]
  );

  const pinnedEntries = useMemo(
    () =>
      pinned
        .map((id) => SETTINGS_CATALOG.find((e) => e.id === id))
        .filter((e): e is SettingsEntry => Boolean(e)),
    [pinned]
  );

  const searching = query.trim().length > 0;

  const planLabel = foundingNumber
    ? `Founding Member #${foundingNumber}`
    : tier === "plus"
      ? "Plus"
      : donorStatus === "active"
        ? "Ink Donor"
        : "Free";

  return (
    <div className="set-page">
      {/* ── Masthead ───────────────────────────────────────────────── */}
      <header className="set-masthead">
        <div className="set-masthead-id">
          <AvatarWithFrame
            url={avatarUrl}
            name={displayName || username}
            size={52}
            frame={avatarFrame}
            subscriptionTier={tier}
          />
          <div className="set-masthead-text">
            <h1 className="set-masthead-title">Settings</h1>
            <p className="set-masthead-sub">
              {displayName || username}
              {username && <span className="set-masthead-handle"> @{username}</span>}
              <Link href="/settings/billing" className="set-plan-chip">
                {planLabel}
              </Link>
            </p>
          </div>
        </div>

        <div className="set-search-wrap">
          <svg
            className="set-search-icon"
            width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="20" y1="20" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={searchRef}
            className="set-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search settings — try “domain”, “push”, “export”"
            aria-label="Search settings"
          />
          {!searching && <kbd className="set-search-kbd">/</kbd>}
        </div>
      </header>

      {loadFailed && (
        <p className="set-notice set-notice--warn" role="status">
          We couldn&apos;t load your current settings just now, so the summaries
          below are missing. Every page still works — or reload to try again.
        </p>
      )}

      {pinError && (
        <p className="set-notice set-notice--error" role="alert">
          {pinError}
        </p>
      )}

      {/* ── Quick access ───────────────────────────────────────────── */}
      {!searching && (
        <section className="set-quick">
          <div className="set-quick-head">
            <h2 className="set-group-title">Quick access</h2>
            <p className="set-group-blurb">
              {pinnedEntries.length > 0
                ? "The pages you reach for. Pin or unpin any card below."
                : "Pin the cards you use most and they'll wait for you here."}
            </p>
          </div>

          {pinnedEntries.length > 0 ? (
            <div className="set-quick-row">
              {pinnedEntries.map((entry) => (
                <Link key={entry.id} href={entry.href} className="set-quick-card">
                  <span className="set-quick-icon">{entry.icon}</span>
                  <span className="set-quick-title">{entry.title}</span>
                  {status[entry.id] && (
                    <span className="set-quick-status">{status[entry.id]}</span>
                  )}
                  <button
                    type="button"
                    className="set-quick-unpin"
                    aria-label={`Unpin ${entry.title} from quick access`}
                    onClick={(e) => {
                      e.preventDefault();
                      togglePin(entry.id);
                    }}
                  >
                    <PinIcon filled />
                  </button>
                </Link>
              ))}
            </div>
          ) : (
            <div className="set-quick-empty">
              <PinIcon />
              <span>
                Nothing pinned yet — hit the pin on any card to build your own
                shortcut row.
              </span>
            </div>
          )}
        </section>
      )}

      {/* ── The grid ───────────────────────────────────────────────── */}
      {searching && results.length === 0 && (
        <p className="set-no-results">
          Nothing matches <strong>{query}</strong>. Try a word from the setting
          itself — “css”, “mastodon”, “subscribers”.
        </p>
      )}

      {SETTINGS_GROUPS.map((group) => {
        const items = results.filter((e) => e.group === group.id);
        if (items.length === 0) return null;
        return (
          <section key={group.id} className="set-group">
            <div className="set-group-head">
              <h2 className="set-group-title">{group.title}</h2>
              <p className="set-group-blurb">{group.blurb}</p>
            </div>
            <div className="set-grid">
              {items.map((entry) => (
                <Card
                  key={entry.id}
                  entry={entry}
                  status={status[entry.id] ?? null}
                  pinned={pinned.includes(entry.id)}
                  onTogglePin={togglePin}
                  tier={tier}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Card({
  entry,
  status,
  pinned,
  onTogglePin,
  tier,
}: {
  entry: SettingsEntry;
  status: string | null;
  pinned: boolean;
  onTogglePin: (id: string) => void;
  tier: string;
}) {
  const showPlusTag = entry.plus && tier !== "plus";

  return (
    <Link
      href={entry.href}
      className={`set-card${entry.danger ? " set-card--danger" : ""}`}
    >
      <span className="set-card-top">
        <span className="set-card-icon">{entry.icon}</span>
        <span className="set-card-title">{entry.title}</span>
        {showPlusTag && <span className="set-card-plus">Plus</span>}
        <button
          type="button"
          className={`set-card-pin${pinned ? " set-card-pin--on" : ""}`}
          aria-label={
            pinned
              ? `Unpin ${entry.title} from quick access`
              : `Pin ${entry.title} to quick access`
          }
          aria-pressed={pinned}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onTogglePin(entry.id);
          }}
        >
          <PinIcon filled={pinned} />
        </button>
      </span>

      <span className="set-card-blurb">{entry.blurb}</span>

      <span className="set-card-foot">
        {status && <span className="set-card-status">{status}</span>}
        <span className="set-card-go" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </span>
      </span>
    </Link>
  );
}

function PinIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 4v6l-2 4v2h10v-2l-2-4V4" />
      <line x1="12" y1="16" x2="12" y2="21" />
      <line x1="8" y1="4" x2="16" y2="4" />
    </svg>
  );
}
