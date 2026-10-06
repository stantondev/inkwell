"use client";

import { useEffect, useState } from "react";
import { ListeningCard } from "@/components/listening-card";
import type { SongMetadata } from "@/lib/music";

interface Listening {
  playing_now: boolean;
  listened_at: string | null;
  music_metadata: SongMetadata;
}

// Older than this, the "last played" song is stale: show the profile song instead.
const STALE_DAYS = 30;
const REFRESH_MS = 2 * 60 * 1000;

function ago(iso: string | null): string {
  if (!iso) return "";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return hours === 1 ? "an hour ago" : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

function fresh(l: Listening): boolean {
  if (l.playing_now) return true;
  if (!l.listened_at) return false;
  return Date.now() - new Date(l.listened_at).getTime() < STALE_DAYS * 86400000;
}

/**
 * The profile's music widget for members who connected ListenBrainz (Settings
 * → Listening): what they're listening to now, or what they last played. It
 * loads after the page (ListenBrainz can be slow) and refreshes while the page
 * is open. While it loads, when there's nothing recent, or when ListenBrainz
 * doesn't answer, the profile song they picked in Customize shows instead
 * (`fallback`).
 */
export function ProfileListening({
  username,
  fallback,
  surfaceStyle,
  mutedColor,
  borderRadius = "rounded-xl",
}: {
  username: string;
  fallback?: React.ReactNode;
  surfaceStyle: React.CSSProperties;
  mutedColor: string;
  borderRadius?: string;
}) {
  const [state, setState] = useState<"loading" | "shown" | "fallback">("loading");
  const [listening, setListening] = useState<Listening | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/users/${encodeURIComponent(username)}/listening`);
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && json.data && fresh(json.data)) {
          setListening(json.data);
          setState("shown");
        } else if (!res.ok && json.code === "unavailable") {
          // ListenBrainz blipped: keep a song already on screen.
          setState((s) => (s === "shown" ? s : "fallback"));
        } else {
          setState("fallback");
        }
      } catch {
        if (!cancelled) setState((s) => (s === "shown" ? s : "fallback"));
      }
    }

    load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  // The profile song shows while ListenBrainz is asked (it can take seconds),
  // so a reader isn't left looking at a placeholder.
  if (state === "fallback" || (state === "loading" && fallback)) return <>{fallback ?? null}</>;

  return (
    <div className={`profile-widget-card ${borderRadius} border p-3 sm:p-4`} style={surfaceStyle} aria-live="polite">
      <div className="flex items-center gap-1.5 mb-3">
        {listening?.playing_now && <span className="profile-listening-bars" aria-hidden="true"><span /><span /><span /></span>}
        <h3 className="text-xs font-medium uppercase tracking-widest" style={{ color: mutedColor }}>
          {state === "loading" ? "Listening" : listening?.playing_now ? "Listening now" : "Last played"}
        </h3>
        {listening && !listening.playing_now && (
          <span className="text-xs" style={{ color: mutedColor }}>· {ago(listening.listened_at)}</span>
        )}
      </div>
      {state === "loading" || !listening ? (
        <div className="flex items-center gap-3" aria-hidden="true">
          <div className="rounded-md animate-pulse" style={{ width: 64, height: 64, background: "var(--surface-hover, var(--border))" }} />
          <div className="flex-1 space-y-2">
            <div className="h-3 rounded animate-pulse" style={{ width: "70%", background: "var(--surface-hover, var(--border))" }} />
            <div className="h-3 rounded animate-pulse" style={{ width: "45%", background: "var(--surface-hover, var(--border))" }} />
          </div>
        </div>
      ) : (
        <ListeningCard track={listening.music_metadata} plain />
      )}
    </div>
  );
}
