"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ListeningCard } from "@/components/listening-card";
import type { ListenBrainzMetadata } from "@/lib/music";

interface Check {
  music: string;
  music_metadata: ListenBrainzMetadata;
  playing_now: boolean;
  listened_at?: string | null;
}

// Mirrors the profile widget: a last song older than this doesn't show there.
const PROFILE_STALE_DAYS = 30;

function daysSince(iso?: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function longAgo(days: number): string {
  if (days < 60) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months < 24 ? `${months} months ago` : `${Math.round(days / 365)} years ago`;
}

export default function ListeningPage() {
  const [saved, setSaved] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState<Check | null>(null);
  // Saved, but ListenBrainz was too slow to show the last song.
  const [slowNote, setSlowNote] = useState(false);
  const [onProfile, setOnProfile] = useState(true);
  const [username, setUsername] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/me");
        if (!res.ok) throw new Error();
        const { data } = await res.json();
        const current = data?.settings?.listenbrainz_username ?? null;
        setSaved(current);
        setName(current ?? "");
        setOnProfile(data?.settings?.listenbrainz_on_profile !== false);
        setUsername(data?.username ?? null);
        setLoaded(true);
        // Show what's connected: the current or last song (quietly; slow is fine).
        if (current) {
          fetch("/api/me/listenbrainz")
            .then((r) => (r.ok ? r.json() : null))
            .then((j) => j?.data && setCheck((c) => c ?? j.data))
            .catch(() => {});
        }
      } catch {
        setError("Couldn't load your settings. Refresh to try again.");
      }
    })();
  }, []);

  async function save(next: string | null) {
    setBusy(true);
    setError(null);
    setCheck(null);
    setSlowNote(false);
    try {
      // Look the account up first, so a typo doesn't get saved. Only a "no
      // such user" stops the save: ListenBrainz is sometimes very slow, and
      // that shouldn't keep anyone from connecting.
      if (next) {
        const res = await fetch(`/api/me/listenbrainz?username=${encodeURIComponent(next)}`).catch(() => null);
        const json = res ? await res.json().catch(() => ({})) : {};
        if (res?.ok && json.data) {
          setCheck(json.data);
        } else if (json.code === "not_found") {
          setError(json.error || "ListenBrainz has no user by that name.");
          return;
        } else if (json.code !== "no_listens") {
          setSlowNote(true);
        }
      }

      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { listenbrainz_username: next ?? "" } }),
      });
      if (!res.ok) throw new Error();
      const { data } = await res.json();
      const current = data?.settings?.listenbrainz_username ?? null;
      setSaved(current);
      setName(current ?? "");
    } catch {
      setError("That didn't save. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleProfile(next: boolean) {
    setProfileSaving(true);
    setOnProfile(next);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { listenbrainz_on_profile: next } }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setOnProfile(!next);
      setError("That didn't save. Try again in a moment.");
    } finally {
      setProfileSaving(false);
    }
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Add your{" "}
        <a href="https://listenbrainz.org" target="_blank" rel="noopener noreferrer" className="underline">ListenBrainz</a>{" "}
        username and Inkwell shows the music you play, from whatever you scrobble from: Navidrome, Funkwhale, a desktop
        player, anything that sends listens to ListenBrainz.
      </p>
      <ul className="text-sm list-disc pl-5 space-y-1" style={{ color: "var(--muted)" }}>
        <li>
          <strong style={{ color: "var(--foreground)" }}>On your profile:</strong> what you&rsquo;re listening to now, or the
          last song you played. It takes the place of your profile song, which comes back if you haven&rsquo;t played
          anything for a month.
        </li>
        <li>
          <strong style={{ color: "var(--foreground)" }}>In the editor:</strong> a <strong>Now playing</strong> button
          beside &ldquo;Listening to&rdquo; fills in the song you&rsquo;re playing, with its cover art.
        </li>
      </ul>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Inkwell only reads your public listens, so it never needs your ListenBrainz password or token.
      </p>

      <form
        className="rounded-xl border p-4 space-y-3"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        onSubmit={(e) => {
          e.preventDefault();
          const next = name.trim();
          if (next && next !== saved) save(next);
        }}
      >
        <label htmlFor="lb-username" className="block text-sm font-medium">ListenBrainz username</label>
        <div className="flex flex-wrap gap-2">
          <input
            id="lb-username"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!loaded || busy}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={64}
            placeholder="your username"
            className="flex-1 min-w-[12rem] rounded-lg border px-3 py-2 text-base sm:text-sm"
            style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--foreground)" }}
          />
          <button
            type="submit"
            disabled={!loaded || busy || !name.trim() || name.trim() === saved}
            className="rounded-full px-4 py-2 text-sm font-medium disabled:opacity-50"
            style={{ background: "var(--accent)", color: "var(--background)" }}
          >
            {busy ? "Checking…" : "Save"}
          </button>
          {saved && (
            <button
              type="button"
              disabled={busy}
              onClick={() => save(null)}
              className="rounded-full border px-4 py-2 text-sm disabled:opacity-50"
              style={{ borderColor: "var(--border)", color: "var(--muted)" }}
            >
              Remove
            </button>
          )}
        </div>
        {saved && !error && (
          <p className="text-sm" style={{ color: "var(--muted)" }} role="status">
            Connected as <strong style={{ color: "var(--foreground)" }}>{saved}</strong>.
            {check
              ? check.playing_now ? " Playing right now:" : " Your last song:"
              : slowNote
                ? " ListenBrainz is slow to answer right now, so we couldn't show your last song. Now playing will try again when you press it."
                : " Press Now playing in the editor to use it."}
          </p>
        )}
        {check && <ListeningCard track={check.music_metadata} />}
        {check && !check.playing_now && (daysSince(check.listened_at) ?? 0) >= PROFILE_STALE_DAYS && (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            That was {longAgo(daysSince(check.listened_at)!)}, so your profile shows your profile song until you play
            something new.
          </p>
        )}
        {saved && (
          <label className="flex items-start gap-2 text-sm pt-1 cursor-pointer">
            <input
              type="checkbox"
              checked={onProfile}
              disabled={profileSaving}
              onChange={(e) => toggleProfile(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Show what I&rsquo;m listening to on my profile
              {onProfile && username && (
                <>
                  {" "}·{" "}
                  <Link href={`/${username}`} className="underline" style={{ color: "var(--muted)" }}>see it</Link>
                </>
              )}
            </span>
          </label>
        )}
        {error && <p className="text-sm" style={{ color: "var(--danger)" }} role="alert">{error}</p>}
      </form>

      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Posting from your own tool? Send <code>&quot;music_from&quot;: &quot;listenbrainz&quot;</code> with an entry and
        Inkwell fills it in for you. See <Link href="/developers" className="underline">the API docs</Link>.
      </p>
    </div>
  );
}
