"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { ProfileStyles } from "@/lib/profile-styles";
import { Avatar } from "@/components/avatar-with-frame";
import { getSite, siteUrl } from "@/lib/site";
import type { GuestbookLook } from "@/lib/profile-home";

interface RemoteAuthor {
  ap_id: string;
  username: string;
  domain: string;
  display_name: string;
  avatar_url: string | null;
  profile_url: string | null;
}

type Paper = "cream" | "sky" | "rose" | "sage" | "lilac" | "kraft";
const PAPERS: { id: Paper; label: string }[] = [
  { id: "cream", label: "Cream" },
  { id: "sky", label: "Sky blue" },
  { id: "rose", label: "Rose" },
  { id: "sage", label: "Sage" },
  { id: "lilac", label: "Lilac" },
  { id: "kraft", label: "Kraft" },
];

export interface GuestbookEntry {
  id: string;
  body: string;
  stationery?: Paper;
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
  viewerUsername,
  styles,
  look = "list",
  initial,
  staticView = false,
}: {
  username: string;
  isOwnProfile: boolean;
  isLoggedIn: boolean;
  viewerUsername?: string;
  styles: ProfileStyles;
  /** How signatures look: a list, envelopes that open, or postcards. */
  look?: GuestbookLook;
  /** Signatures fetched on the server (the exported website, which has no scripts). */
  initial?: GuestbookEntry[];
  /** Read-only: no signing, no removing, envelopes already open. */
  staticView?: boolean;
}) {
  const [entries, setEntries] = useState<GuestbookEntry[]>(initial ?? []);
  const [total, setTotal] = useState(initial?.length ?? 0);
  const [message, setMessage] = useState("");
  const [posting, setPosting] = useState(false);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState("");
  const [signed, setSigned] = useState(false);
  const [copied, setCopied] = useState(false);
  const [paper, setPaper] = useState<Paper>("cream");
  const signInHref = `/login?next=${encodeURIComponent(`/${username}#guestbook`)}`;

  useEffect(() => {
    if (!initial) fetchEntries();
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
        body: JSON.stringify({ body: message.trim(), stationery: paper }),
      });

      if (res.ok) {
        const data = await res.json();
        setEntries((prev) => [data.data, ...prev]);
        setTotal((t) => t + 1);
        setMessage("");
        setSigned(true);
      } else {
        const data = await res.json().catch(() => ({}));
        // Validation errors come back as {errors: {field: [msg]}}.
        const fieldError = data.errors
          ? Object.values(data.errors as Record<string, string[]>).flat()[0]
          : null;
        setError(fieldError ? `Message ${fieldError}` : data.error ?? "Couldn't sign the guestbook. Please try again.");
      }
    } catch {
      setError("Couldn't reach Inkwell. Check your connection and try again.");
    } finally {
      setPosting(false);
    }
  }

  async function handleDelete(entryId: string) {
    if (!window.confirm("Remove this guestbook message?")) return;
    try {
      const res = await fetch(`/api/guestbook/${entryId}`, { method: "DELETE" });
      if (res.ok) {
        setEntries((prev) => prev.filter((e) => e.id !== entryId));
        setTotal((t) => t - 1);
      } else {
        window.alert("Couldn't remove that message. Please try again.");
      }
    } catch {
      window.alert("Couldn't reach Inkwell. Please try again.");
    }
  }

  function handleCopyUrl() {
    const url = siteUrl(`/users/${username}/guestbook-post`);
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div id="guestbook" className={`profile-widget-card ${styles.borderRadius} border p-3 sm:p-4`} style={styles.surface}>
      <h3 className="text-xs font-medium uppercase tracking-widest mb-1" style={{ color: styles.muted }}>
        Guestbook {total > 0 && <span className="normal-case font-normal">({total})</span>}
      </h3>
      {!staticView && <p className="text-xs mb-3" style={{ color: styles.muted }}>
        {isOwnProfile
          ? "Notes visitors leave on your page. You're notified when someone signs."
          : `A public note on ${username}'s page, like an old-school guestbook. They'll be notified.`}
      </p>}

      {/* Sign form */}
      {isLoggedIn && !isOwnProfile && !staticView && (
        <form onSubmit={handleSubmit} className="mb-3">
          {signed && (
            <p className="text-xs mb-2" role="status" style={{ color: styles.accent }}>
              ✓ Signed! {username} will see your note.
            </p>
          )}
          <textarea
            value={message}
            onChange={(e) => { setMessage(e.target.value); if (signed) setSigned(false); }}
            aria-label={`Sign ${username}'s guestbook`}
            placeholder={signed ? "Leave another note…" : "Say hello, leave a kind word…"}
            maxLength={500}
            rows={2}
            className="w-full rounded-lg border px-3 py-2 text-sm bg-transparent outline-none focus:ring-2 focus:ring-[var(--accent)] transition resize-none"
            style={{ borderColor: styles.border }}
          />
          <div className="flex items-center justify-between gap-2 mt-1.5 flex-wrap">
            <span className="text-xs" style={{ color: styles.muted }}>{message.length}/500</span>
            {look !== "list" && (
              <span className="gb-papers" role="radiogroup" aria-label="Your paper">
                {PAPERS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={paper === p.id}
                    aria-label={p.label}
                    title={p.label}
                    className="gb-paper-swatch"
                    data-paper={p.id}
                    onClick={() => setPaper(p.id)}
                  />
                ))}
              </span>
            )}
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
        !isOwnProfile && !staticView && (
          <p className="text-xs" style={{ color: styles.muted }}>
            {isLoggedIn ? "Be the first to sign!" : (
              <>
                No entries yet.{" "}
                <a href={signInHref} className="font-medium hover:underline" style={{ color: styles.accent }}>
                  Sign in
                </a>{" "}
                or{" "}
                <Link href="/get-started" className="font-medium hover:underline" style={{ color: styles.accent }}>
                  join Inkwell
                </Link>{" "}
                to be the first to sign.
              </>
            )}
          </p>
        )
      ) : look === "envelopes" || look === "postcards" ? (
        <Signatures
          look={look}
          entries={entries}
          owner={username}
          staticView={staticView}
          canRemove={(e) => !staticView && (isOwnProfile || (!!viewerUsername && e.author?.username === viewerUsername))}
          onRemove={handleDelete}
        />
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
                  {(isOwnProfile || (!!viewerUsername && entry.author?.username === viewerUsername)) && (
                    <button
                      type="button"
                      onClick={() => handleDelete(entry.id)}
                      className="text-xs flex-shrink-0 p-1 opacity-50 hover:opacity-100 focus:opacity-100 transition-opacity"
                      style={{ color: styles.muted }}
                      aria-label="Remove this message"
                      title="Remove this message">
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
      {!isLoggedIn && !isOwnProfile && !staticView && entries.length > 0 && (
        <p className="text-xs mt-3 pt-2 border-t" style={{ color: styles.muted, borderColor: styles.border }}>
          <a href={signInHref} className="font-medium hover:underline" style={{ color: styles.accent }}>
            Sign in
          </a>{" "}
          or{" "}
          <Link href="/get-started" className="font-medium hover:underline" style={{ color: styles.accent }}>
            join Inkwell
          </Link>{" "}
          to sign {username}&apos;s guestbook.
        </p>
      )}

      {/* From the fediverse? hint — for visitors who aren't signed in to Inkwell */}
      {!isLoggedIn && !staticView && (
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
            {getSite().host}/users/{username}/guestbook-post
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
      )}
    </div>
  );
}

function signer(entry: GuestbookEntry) {
  const isRemote = !!entry.remote_author;
  return {
    isRemote,
    name: isRemote
      ? entry.remote_author!.display_name || entry.remote_author!.username
      : entry.author?.display_name || entry.author?.username || "Someone who left",
    avatar: isRemote ? entry.remote_author!.avatar_url : entry.author?.avatar_url ?? null,
    href: isRemote ? entry.remote_author!.profile_url : entry.author ? `/${entry.author.username}` : null,
    handle: isRemote ? `@${entry.remote_author!.username}@${entry.remote_author!.domain}` : null,
  };
}

/** A signature's date as a postmark: "16 OCT 2026". */
function postmark(iso: string): string {
  return new Date(iso)
    .toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .toUpperCase();
}

/** Envelopes that open, or postcards: the guestbook as correspondence. */
function Signatures({
  look,
  entries,
  owner,
  staticView = false,
  canRemove,
  onRemove,
}: {
  look: "envelopes" | "postcards";
  entries: GuestbookEntry[];
  owner: string;
  staticView?: boolean;
  canRemove: (e: GuestbookEntry) => boolean;
  onRemove: (id: string) => void;
}) {
  // Without scripts the envelopes can't be opened, so the exported page shows them open.
  const [open, setOpen] = useState<Set<string>>(() => (staticView ? new Set(entries.map((e) => e.id)) : new Set()));
  const allOpen = entries.length > 0 && entries.every((e) => open.has(e.id));
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (look === "postcards") {
    return (
      <ul className="gb-postcards">
        {entries.map((entry) => {
          const who = signer(entry);
          return (
            <li key={entry.id} className="gb-postcard" data-paper={entry.stationery ?? "cream"}>
              <p className="gb-postcard-message">{entry.body}</p>
              <div className="gb-postcard-side">
                <span className="gb-postcard-stamp" aria-hidden="true">
                  <Avatar url={who.avatar} name={who.name} size={30} />
                </span>
                <span className="gb-postmark" aria-hidden="true">{postmark(entry.created_at)}</span>
                <span className="gb-postcard-line">To {owner}</span>
                <span className="gb-postcard-line">
                  From{" "}
                  {who.href ? (
                    <a href={who.href} {...(who.isRemote ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{who.name}</a>
                  ) : (
                    who.name
                  )}
                </span>
                {who.handle && <span className="gb-postcard-handle">{who.handle}</span>}
                {canRemove(entry) && (
                  <button type="button" className="gb-remove" onClick={() => onRemove(entry.id)}>Remove</button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <>
      {!staticView && <div className="gb-envelopes-head">
        <button
          type="button"
          className="gb-open-all"
          onClick={() => setOpen(allOpen ? new Set() : new Set(entries.map((e) => e.id)))}
        >
          {allOpen ? "Close them all" : "Open them all"}
        </button>
      </div>}
      <ul className="gb-envelopes">
        {entries.map((entry) => {
          const who = signer(entry);
          const isOpen = open.has(entry.id);
          return (
            <li key={entry.id} className="gb-envelope" data-paper={entry.stationery ?? "cream"} data-open={isOpen || undefined}>
              <button
                type="button"
                className="gb-envelope-front"
                aria-expanded={isOpen}
                aria-controls={`gb-letter-${entry.id}`}
                onClick={() => toggle(entry.id)}
              >
                <span className="gb-envelope-flap" aria-hidden="true" />
                <span className="gb-envelope-from">
                  <span className="gb-envelope-label">From</span> {who.name}
                </span>
                <span className="gb-envelope-stamp" aria-hidden="true">
                  <Avatar url={who.avatar} name={who.name} size={26} />
                </span>
                <span className="gb-postmark" aria-hidden="true">{postmark(entry.created_at)}</span>
                <span className="sr-only">{isOpen ? "Close" : "Open"} the note</span>
              </button>
              {isOpen && (
                <div className="gb-letter" id={`gb-letter-${entry.id}`}>
                  <p>{entry.body}</p>
                  <p className="gb-letter-sign">
                    {who.href ? (
                      <a href={who.href} {...(who.isRemote ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{who.name}</a>
                    ) : (
                      who.name
                    )}
                    {who.handle && <span className="gb-postcard-handle"> {who.handle}</span>}
                  </p>
                  {canRemove(entry) && (
                    <button type="button" className="gb-remove" onClick={() => onRemove(entry.id)}>Remove</button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
