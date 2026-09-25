"use client";

// Writers worth following, with a Follow button on each. Shown on an empty
// Feed; the list comes from the same endpoint as onboarding's "Discover
// writers" step (people with published entries you don't follow). Following
// sends a pen pal request; their public entries reach your Feed right away.

import { useEffect, useState } from "react";
import Link from "next/link";
import { AvatarWithFrame } from "@/components/avatar-with-frame";

interface SuggestedWriter {
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

export function SuggestedWriters({ limit = 6 }: { limit?: number }) {
  const [writers, setWriters] = useState<SuggestedWriter[] | null>(null);
  const [requests, setRequests] = useState<Record<string, RequestState>>({});

  useEffect(() => {
    fetch("/api/discover/writers")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((d) => setWriters((d.data ?? []).slice(0, limit)))
      .catch(() => setWriters([]));
  }, [limit]);

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

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {writers.map((w) => {
        const name = w.display_name || w.username;
        const state = requests[w.id];
        const done = state === "requested" || state === "accepted";
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
              <button
                type="button"
                onClick={() => request(w)}
                disabled={done || state === "sending"}
                className="mt-2 rounded-full px-3 py-1 text-xs font-medium border transition-opacity disabled:opacity-70"
                style={done
                  ? { borderColor: "var(--border)", color: "var(--muted)", background: "transparent" }
                  : { borderColor: "var(--accent)", color: "#fff", background: "var(--accent)" }}
              >
                {state === "sending" ? "Following…"
                  : state === "accepted" ? "Pen pals ✓"
                  : state === "requested" ? "Following ✓"
                  : state === "failed" ? "Try again"
                  : "Follow"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
