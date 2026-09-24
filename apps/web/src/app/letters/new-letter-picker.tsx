"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AvatarWithFrame } from "@/components/avatar";

interface PenPal {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  avatar_frame?: string | null;
  /** A fediverse account (username is then user@domain). */
  remote?: boolean;
}

interface FediverseAccount {
  id: string;
  username: string;
  domain: string;
  display_name: string | null;
  avatar_url: string | null;
}

async function loadList<T>(url: string): Promise<T[]> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(url);
  const json = await res.json();
  return Array.isArray(json.data) ? json.data : [];
}

/**
 * "New letter": choose someone to write to and open (or reopen) your letters
 * with them. That's your pen pals, plus fediverse accounts you follow or that
 * follow you (their letters go as private messages).
 */
export function NewLetterPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [pals, setPals] = useState<PenPal[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setError(null);
    setTimeout(() => inputRef.current?.focus(), 30);

    if (pals === null) {
      // Pen pals are required; the fediverse lists are a bonus, so a failure
      // there just leaves them out.
      Promise.all([
        loadList<PenPal>("/api/pen-pals"),
        loadList<FediverseAccount>("/api/fediverse-followers").catch(() => []),
        loadList<FediverseAccount>("/api/fediverse-following").catch(() => []),
      ])
        .then(([local, followers, following]) => {
          const remote = new Map<string, PenPal>();
          for (const a of [...followers, ...following]) {
            if (!a.username || !a.domain) continue;
            remote.set(a.id, {
              id: a.id,
              username: `${a.username}@${a.domain}`,
              display_name: a.display_name,
              avatar_url: a.avatar_url,
              remote: true,
            });
          }
          setPals([...local, ...remote.values()]);
        })
        .catch(() => setLoadError(true));
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, pals]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^@/, "");
    const list = [...(pals ?? [])].sort((a, b) =>
      (a.display_name || a.username).localeCompare(b.display_name || b.username)
    );
    if (!q) return list;
    return list.filter(
      (p) => p.username.toLowerCase().includes(q) || (p.display_name || "").toLowerCase().includes(q)
    );
  }, [pals, query]);

  const start = async (pal: PenPal) => {
    setOpening(pal.username);
    setError(null);
    try {
      const res = await fetch("/api/letters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pal.remote ? { remote_actor_id: pal.id } : { username: pal.username }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.data?.id) {
        router.push(`/letters/${json.data.id}`);
        return;
      }
      setError(json.error || "Couldn't open a letter right now. Please try again.");
    } catch {
      setError("Couldn't open a letter right now. Please try again.");
    }
    setOpening(null);
  };

  if (!mounted || !open) return null;

  return createPortal(
    <>
      <div className="letter-picker-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="letter-picker" role="dialog" aria-modal="true" aria-label="Write a new letter">
        <div className="letter-picker-head">
          <h2>Write to a pen pal</h2>
          <button type="button" className="letter-picker-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <input
          ref={inputRef}
          className="letter-picker-search"
          type="search"
          placeholder="Search your pen pals"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && shown.length > 0) start(shown[0]);
          }}
          aria-label="Search your pen pals"
        />
        {error && (
          <p className="letter-page-error" role="alert" style={{ padding: "0 18px" }}>
            {error}
          </p>
        )}
        <div className="letter-picker-list">
          {loadError ? (
            <p className="letter-picker-note">Couldn&apos;t load your pen pals. Please try again.</p>
          ) : pals === null ? (
            <p className="letter-picker-note">Loading…</p>
          ) : pals.length === 0 ? (
            <p className="letter-picker-note">
              Letters are for pen pals, here and on the fediverse. Find some on{" "}
              <Link href="/explore">Explore</Link>, or see <Link href="/pen-pals">your pen pals</Link>.
            </p>
          ) : shown.length === 0 ? (
            <p className="letter-picker-note">No pen pals match “{query}”.</p>
          ) : (
            shown.map((pal) => (
              <button
                key={pal.remote ? `fedi-${pal.id}` : pal.id}
                type="button"
                className="letter-picker-row"
                onClick={() => start(pal)}
                disabled={opening !== null}
              >
                <AvatarWithFrame
                  url={pal.avatar_url}
                  name={pal.display_name || pal.username}
                  size={36}
                  frame={pal.avatar_frame}
                />
                <span className="letter-picker-row-text">
                  <span className="letter-picker-row-name">{pal.display_name || pal.username}</span>
                  <span className="letter-picker-row-handle">
                    @{pal.username}
                    {pal.remote && " · fediverse"}
                  </span>
                </span>
                {opening === pal.username && <span className="letter-picker-row-handle">Opening…</span>}
              </button>
            ))
          )}
        </div>
      </div>
    </>,
    document.body
  );
}
