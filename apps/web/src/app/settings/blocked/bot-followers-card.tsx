"use client";

import { useEffect, useState } from "react";

interface BotAccount {
  id: string;
  username: string;
  domain: string;
  display_name: string | null;
}

/**
 * Settings → Blocked: keep fediverse bot accounts from following you, and
 * remove the ones that already do. "Bot" means the account says it's
 * automated (Mastodon's "This is an automated account").
 */
export function BotFollowersCard() {
  const [loaded, setLoaded] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [bots, setBots] = useState<BotAccount[]>([]);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/fediverse-followers/bots")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setBots(data.data ?? []);
        setDeclining(!!data.meta?.declining);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle(next: boolean) {
    setSaving(true);
    setMessage(null);
    const before = declining;
    setDeclining(next);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { decline_bot_follows: next } }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setDeclining(before);
      setMessage("Couldn't save that. Try again in a moment.");
    } finally {
      setSaving(false);
    }
  }

  async function removeAll() {
    setRemoving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/fediverse-followers/bots/remove", { method: "POST" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const n = data.data?.removed ?? 0;
      setBots([]);
      setMessage(n === 1 ? "Removed 1 bot follower." : `Removed ${n} bot followers.`);
    } catch {
      setMessage("That didn't work. Try again in a moment.");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <section id="bots" className="scroll-mt-24">
      <h2 className="text-lg font-semibold mb-1">Bot accounts</h2>
      <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
        Some fediverse accounts are run by programs, not people, and say so. This only catches accounts
        marked as bots; you can block any other account from Pen Pals or the follow notification.
      </p>

      <div
        className="rounded-xl border p-4 flex flex-col gap-4"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={declining}
            disabled={!loaded || saving}
            onChange={(e) => toggle(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0"
            style={{ accentColor: "var(--accent)" }}
          />
          <span>
            <span className="text-sm font-medium block">Don&apos;t let bot accounts follow me</span>
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              New follows from bots are turned down. You won&apos;t get a notification for them.
            </span>
          </span>
        </label>

        {loaded && bots.length > 0 && (
          <div className="border-t pt-4" style={{ borderColor: "var(--border)" }}>
            <p className="text-sm mb-2">
              {bots.length === 1 ? "1 bot account follows you" : `${bots.length} bot accounts follow you`}:
            </p>
            <ul className="text-xs mb-3 flex flex-col gap-1" style={{ color: "var(--muted)" }}>
              {bots.slice(0, 8).map((b) => (
                <li key={b.id} className="truncate">
                  {b.display_name ? `${b.display_name} · ` : ""}@{b.username}@{b.domain}
                </li>
              ))}
              {bots.length > 8 && <li>and {bots.length - 8} more</li>}
            </ul>
            <button
              type="button"
              onClick={removeAll}
              disabled={removing}
              className="rounded-full border px-4 py-1.5 text-sm font-medium disabled:opacity-50"
              style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
            >
              {removing ? "Removing…" : bots.length === 1 ? "Remove it" : "Remove them"}
            </button>
            <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
              They stop getting your posts. They can follow you again unless the switch above is on.
            </p>
          </div>
        )}

        {message && (
          <p className="text-sm" role="status" style={{ color: "var(--muted)" }}>
            {message}
          </p>
        )}
      </div>
    </section>
  );
}
