"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ListeningCard } from "@/components/listening-card";
import type { ListenBrainzMetadata } from "@/lib/music";

interface Check {
  music: string;
  music_metadata: ListenBrainzMetadata;
  playing_now: boolean;
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

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/me");
        if (!res.ok) throw new Error();
        const { data } = await res.json();
        const current = data?.settings?.listenbrainz_username ?? null;
        setSaved(current);
        setName(current ?? "");
        setLoaded(true);
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

  return (
    <div className="space-y-5 max-w-2xl">
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Add your{" "}
        <a href="https://listenbrainz.org" target="_blank" rel="noopener noreferrer" className="underline">ListenBrainz</a>{" "}
        username and the editor gets a <strong>Now playing</strong> button beside &ldquo;Listening to&rdquo;. It fills in
        the song you&rsquo;re playing, with its cover art, from whatever you scrobble from: Navidrome, Funkwhale, a desktop
        player, anything that sends listens to ListenBrainz.
      </p>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Inkwell only reads your public listens, so it never needs your ListenBrainz password or token, and it only looks
        when you press the button.
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
        {error && <p className="text-sm" style={{ color: "var(--danger)" }} role="alert">{error}</p>}
      </form>

      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Posting from your own tool? Send <code>&quot;music_from&quot;: &quot;listenbrainz&quot;</code> with an entry and
        Inkwell fills it in for you. See <Link href="/developers" className="underline">the API docs</Link>.
      </p>
    </div>
  );
}
