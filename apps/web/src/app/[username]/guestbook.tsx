"use client";

import { useState, useEffect } from "react";
import type { ProfileStyles } from "@/lib/profile-styles";
import { Avatar } from "@/components/avatar-with-frame";

interface RemoteAuthor {
  ap_id: string;
  username: string;
  domain: string;
  display_name: string;
  avatar_url: string | null;
  profile_url: string | null;
}

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
  remote_author: RemoteAuthor | null;
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

// Globe icon for fediverse entries
function GlobeIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: "var(--muted)", flexShrink: 0 }}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
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
  const [copied, setCopied] = useState(false);

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

  function handleCopyUrl() {
    const url = `https://inkwell.social/users/${username}/guestbook-post`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className={`profile-widget-card ${styles.borderRadius} border p-3 sm:p-4`} style={styles.surface}>
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
            {isLoggedIn ? "Be the first to sign!" : (
              <>
                No entries yet.{" "}
                <a href="/get-started" className="font-medium hover:underline" style={{ color: styles.accent }}>
                  Join Inkwell
                </a>{" "}
                to sign the guestbook.
              </>
            )}
          </p>
        )
      ) : (
        <div className="flex flex-col gap-3">
          {entries.map((entry) => {
            const isRemote = !!entry.remote_author;
            const authorName = isRemote
              ? entry.remote_author!.display_name || entry.remote_author!.username
              : entry.author?.display_name ?? "[deleted]";
            const avatarUrl = isRemote
              ? entry.remote_author!.avatar_url
              : entry.author?.avatar_url ?? null;
            const profileHref = isRemote
              ? entry.remote_author!.profile_url
              : entry.author ? `/${entry.author.username}` : null;

            return (
              <div key={entry.id} className="border-b pb-3 last:border-0 last:pb-0" style={{ borderColor: styles.border }}>
                <div className="flex items-start gap-2">
                  {profileHref ? (
                    <a
                      href={profileHref}
                      className="flex-shrink-0"
                      {...(isRemote ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    >
                      <Avatar url={avatarUrl} name={authorName} size={24} />
                    </a>
                  ) : (
                    <div className="w-6 h-6 rounded-full" style={{ background: styles.border }} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                      {profileHref ? (
                        <a
                          href={profileHref}
                          className="text-xs font-medium hover:underline"
                          {...(isRemote ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                        >
                          {authorName}
                        </a>
                      ) : (
                        <span className="text-xs italic" style={{ color: styles.muted }}>[deleted]</span>
                      )}
                      {isRemote && (
                        <>
                          <GlobeIcon />
                          <span className="text-xs" style={{ color: styles.muted }}>
                            @{entry.remote_author!.username}@{entry.remote_author!.domain}
                          </span>
                        </>
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
            );
          })}
        </div>
      )}

      {/* Logged-out CTA to sign guestbook */}
      {!isLoggedIn && !isOwnProfile && entries.length > 0 && (
        <p className="text-xs mt-3 pt-2 border-t" style={{ color: styles.muted, borderColor: styles.border }}>
          <a href="/get-started" className="font-medium hover:underline" style={{ color: styles.accent }}>
            Join Inkwell
          </a>{" "}
          to sign {username}&apos;s guestbook.
        </p>
      )}

      {/* From the fediverse? hint */}
      <div className="mt-3 pt-2 border-t" style={{ borderColor: styles.border }}>
        <div className="flex items-center gap-1.5 mb-1">
          <GlobeIcon />
          <span className="text-xs italic" style={{ color: styles.muted, fontFamily: "var(--font-lora, Georgia, serif)" }}>
            From the fediverse?
          </span>
        </div>
        <p className="text-xs leading-relaxed" style={{ color: styles.muted }}>
          Paste this URL into your Mastodon search bar, then reply to sign the guestbook:
        </p>
        <div className="flex items-center gap-1.5 mt-1">
          <code
            className="text-xs px-2 py-0.5 rounded flex-1 min-w-0 truncate"
            style={{ background: "var(--background)", border: `1px solid ${styles.border}` }}
          >
            inkwell.social/users/{username}/guestbook-post
          </code>
          <button
            type="button"
            onClick={handleCopyUrl}
            className="text-xs px-2 py-0.5 rounded-full flex-shrink-0 transition-opacity hover:opacity-80"
            style={{ background: styles.accent, color: "#fff" }}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>
    </div>
  );
}
