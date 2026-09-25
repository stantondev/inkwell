"use client";

// Writers worth following, with a Follow button on each: the empty Feed and
// Explore's "Writers to meet" page. The list comes from /api/explore/writers
// (people who've written lately; the viewer, people they follow, spam-limited
// and link-farm accounts left out). Following sends a pen pal request; their
// public entries reach your Feed right away. Signed out, Follow goes to
// sign-up with that writer first in line.

import { useEffect, useState } from "react";
import Link from "next/link";
import { AvatarWithFrame } from "@/components/avatar-with-frame";

export interface SuggestedWriter {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  avatar_frame?: string | null;
  avatar_animation?: string | null;
  subscription_tier?: string;
  bio: string | null;
  entry_count: number;
  ink_count: number;
}

type RequestState = "sending" | "requested" | "accepted" | "failed";

export function SuggestedWriters({
  limit = 6,
  initial,
  layout = "grid",
  signedIn = true,
}: {
  limit?: number;
  /** Rendered by the server; skips the fetch. */
  initial?: SuggestedWriter[];
  /** "grid": cards two across (empty Feed); "list": rows (a book page). */
  layout?: "grid" | "list";
  signedIn?: boolean;
}) {
  const [writers, setWriters] = useState<SuggestedWriter[] | null>(initial ? initial.slice(0, limit) : null);
  const [requests, setRequests] = useState<Record<string, RequestState>>({});

  useEffect(() => {
    if (initial) return;
    fetch(`/api/explore/writers?limit=${limit}`)
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((d) => setWriters((d.data ?? []).slice(0, limit)))
      .catch(() => setWriters([]));
  }, [limit, initial]);

  async function request(w: SuggestedWriter) {
    if (requests[w.id] && requests[w.id] !== "failed") return;
    setRequests((p) => ({ ...p, [w.id]: "sending" }));
    try {
      const res = await fetch(`/api/follow/${w.username}`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      setRequests((p) => ({
        ...p,
        [w.id]: !res.ok ? "failed" : body.status === "accepted" ? "accepted" : "requested",
      }));
    } catch {
      setRequests((p) => ({ ...p, [w.id]: "failed" }));
    }
  }

  if (writers === null) {
    return <p className="text-sm text-center py-6" style={{ color: "var(--muted)" }}>Finding writers…</p>;
  }
  if (writers.length === 0) return null;

  function followButton(w: SuggestedWriter) {
    if (!signedIn) {
      return (
        <a href={`/get-started?follow=${encodeURIComponent(w.username)}`} className="writer-follow">
          Follow
        </a>
      );
    }
    const state = requests[w.id];
    const done = state === "requested" || state === "accepted";
    return (
      <button
        type="button"
        onClick={() => request(w)}
        disabled={done || state === "sending"}
        className={`writer-follow${done ? " is-done" : ""}`}
      >
        {state === "sending" ? "Following…"
          : state === "accepted" ? "Pen pals ✓"
          : state === "requested" ? "Following ✓"
          : state === "failed" ? "Try again"
          : "Follow"}
      </button>
    );
  }

  if (layout === "list") {
    return (
      <ul className="writer-list">
        {writers.map((w) => {
          const name = w.display_name || w.username;
          return (
            <li key={w.id} className="writer-row">
              <Link href={`/${w.username}`} className="writer-row-avatar" tabIndex={-1} aria-hidden="true">
                <AvatarWithFrame
                  url={w.avatar_url}
                  name={name}
                  size={40}
                  frame={w.avatar_frame}
                  animation={w.avatar_animation}
                  subscriptionTier={w.subscription_tier}
                />
              </Link>
              <div className="writer-row-text">
                <Link href={`/${w.username}`} className="writer-row-name">{name}</Link>
                <span className="writer-row-meta">
                  @{w.username}
                  {w.entry_count > 0 && <> · {w.entry_count} {w.entry_count === 1 ? "entry" : "entries"}</>}
                </span>
                {w.bio && <span className="writer-row-bio">{w.bio}</span>}
              </div>
              {followButton(w)}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {writers.map((w) => {
        const name = w.display_name || w.username;
        return (
          <div
            key={w.id}
            className="flex items-start gap-3 rounded-xl border p-3 text-left"
            style={{ borderColor: "var(--border)", background: "var(--background)" }}
          >
            <Link href={`/${w.username}`} className="flex-shrink-0">
              <AvatarWithFrame
                url={w.avatar_url}
                name={name}
                size={44}
                frame={w.avatar_frame}
                animation={w.avatar_animation}
                subscriptionTier={w.subscription_tier}
              />
            </Link>
            <div className="min-w-0 flex-1">
              <Link href={`/${w.username}`} className="block text-sm font-semibold truncate hover:underline">
                {name}
              </Link>
              <p className="text-xs truncate" style={{ color: "var(--muted)" }}>
                @{w.username}
                {w.entry_count > 0 && <> · {w.entry_count} {w.entry_count === 1 ? "entry" : "entries"}</>}
              </p>
              {w.bio && (
                <p className="text-xs mt-1 line-clamp-2" style={{ color: "var(--muted)" }}>{w.bio}</p>
              )}
              <div className="mt-2">{followButton(w)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
