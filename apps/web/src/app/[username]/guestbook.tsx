"use client";

import { useState, useEffect } from "react";
import type { ProfileStyles } from "@/lib/profile-styles";

interface GuestbookEntry {
  id: string;
  body: string;
  created_at: string;
  author: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
}

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(isoString).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function Guestbook({
  username,
  isOwnProfile,
  isLoggedIn,
  styles,
}: {
  username: string;
  isOwnProfile: boolean;
  isLoggedIn: boolean;
  styles: ProfileStyles;
}) {
  const [entries, setEntries] = useState<GuestbookEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [message, setMessage] = useState("");
  const [posting, setPosting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchEntries();
  }, [username]);

  async function fetchEntries() {
    try {
      const res = await fetch(`/api/users/${username}/guestbook`);
      if (res.ok) {
        const data = await res.json();
        setEntries(data.data ?? []);
        setTotal(data.meta?.total ?? 0);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;

    setPosting(true);
    setError("");

    try {
      const res = await fetch(`/api/users/${username}/guestbook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: message.trim() }),
      });

      if (res.ok) {
        const data = await res.json();
        setEntries((prev) => [data.data, ...prev]);
        setTotal((t) => t + 1);
        setMessage("");
      } else {
        const data = await res.json();
        setError(data.error ?? "Failed to post");
      }
    } catch {
      setError("Network error");
    } finally {
      setPosting(false);
    }
  }

  async function handleDelete(entryId: string) {
    try {
      const res = await fetch(`/api/guestbook/${entryId}`, { method: "DELETE" });
      if (res.ok) {
        setEntries((prev) => prev.filter((e) => e.id !== entryId));
        setTotal((t) => t - 1);
      }
    } catch {
      // ignore
    }
  }

  return (
    <div className="rounded-xl border p-4" style={styles.surface}>
      <h3 className="text-xs font-medium uppercase tracking-widest mb-3" style={{ color: styles.muted }}>
        Guestbook {total > 0 && <span className="normal-case font-normal">({total})</span>}
      </h3>

      {/* Sign form */}
      {isLoggedIn && !isOwnProfile && (
        <form onSubmit={handleSubmit} className="mb-3">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Sign the guestbook..."
            maxLength={500}
            rows={2}
            className="w-full rounded-lg border px-3 py-2 text-sm bg-transparent outline-none focus:ring-2 focus:ring-[var(--accent)] transition resize-none"
            style={{ borderColor: styles.border }}
          />
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-xs" style={{ color: styles.muted }}>{message.length}/500</span>
            <button
              type="submit"
              disabled={posting || !message.trim()}
              className="text-xs font-medium px-3 py-1 rounded-full transition-opacity disabled:opacity-40"
              style={{ background: styles.accent, color: "#fff" }}>
              {posting ? "Posting..." : "Sign"}
            </button>
          </div>
          {error && <p className="text-xs mt-1" style={{ color: "var(--danger)" }}>{error}</p>}
        </form>
      )}

      {isLoggedIn && isOwnProfile && entries.length === 0 && (
        <p className="text-xs mb-3" style={{ color: styles.muted }}>
          When visitors sign your guestbook, their messages will appear here.
        </p>
      )}

      {/* Entries */}
      {loading ? (
        <p className="text-xs" style={{ color: styles.muted }}>Loading...</p>
      ) : entries.length === 0 ? (
        !isOwnProfile && (
          <p className="text-xs" style={{ color: styles.muted }}>
            {isLoggedIn ? "Be the first to sign!" : "No entries yet."}
          </p>
        )
      ) : (
        <div className="flex flex-col gap-3">
          {entries.map((entry) => (
            <div key={entry.id} className="border-b pb-3 last:border-0 last:pb-0" style={{ borderColor: styles.border }}>
              <div className="flex items-start gap-2">
                {entry.author ? (
                  <a href={`/${entry.author.username}`} className="flex-shrink-0">
                    {entry.author.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={entry.author.avatar_url} alt={entry.author.display_name}
                        className="w-6 h-6 rounded-full object-cover" />
                    ) : (
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold"
                        style={{ background: "var(--accent-light)", color: styles.accent }}>
                        {entry.author.display_name[0]}
                      </div>
                    )}
                  </a>
                ) : (
                  <div className="w-6 h-6 rounded-full" style={{ background: styles.border }} />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    {entry.author ? (
                      <a href={`/${entry.author.username}`} className="text-xs font-medium hover:underline">
                        {entry.author.display_name}
                      </a>
                    ) : (
                      <span className="text-xs italic" style={{ color: styles.muted }}>[deleted]</span>
                    )}
                    <span className="text-xs" style={{ color: styles.muted }}>{timeAgo(entry.created_at)}</span>
                  </div>
                  <p className="text-sm leading-relaxed break-words">{entry.body}</p>
                </div>
                {isOwnProfile && (
                  <button
                    type="button"
                    onClick={() => handleDelete(entry.id)}
                    className="text-xs flex-shrink-0 opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
                    style={{ color: styles.muted }}
                    title="Delete">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
