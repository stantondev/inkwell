"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface SearchUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
}

interface SearchEntry {
  id: string;
  slug: string;
  title: string | null;
  body_html: string;
  published_at: string;
  author: {
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
}

interface FediverseResult {
  id: string;
  username: string;
  domain: string;
  display_name: string;
  avatar_url: string | null;
  ap_id: string;
  profile_url: string;
}

function Avatar({ url, name, size = 40 }: { url: string | null; name: string; size?: number }) {
  const initials = name[0]?.toUpperCase() ?? "?";
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} width={size} height={size}
      className="rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <div className="rounded-full flex items-center justify-center font-semibold text-xs select-none flex-shrink-0"
      style={{ width: size, height: size, background: "var(--accent-light)", color: "var(--accent)", fontSize: size * 0.38 }}
      aria-label={name}>
      {initials}
    </div>
  );
}

function FollowButton({ username }: { username: string }) {
  const [state, setState] = useState<"idle" | "loading" | "pending" | "following">("idle");

  async function handleFollow() {
    setState("loading");
    try {
      const res = await fetch(`/api/follow/${username}`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setState(data.data?.status === "accepted" ? "following" : "pending");
      } else {
        setState("idle");
      }
    } catch {
      setState("idle");
    }
  }

  if (state === "following") {
    return <span className="text-xs px-3 py-1 rounded-full border" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>Reading</span>;
  }
  if (state === "pending") {
    return <span className="text-xs px-3 py-1 rounded-full border" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>Requested</span>;
  }
  return (
    <button onClick={handleFollow} disabled={state === "loading"}
      className="text-xs px-3 py-1 rounded-full border font-medium transition-colors disabled:opacity-50"
      style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>
      {state === "loading" ? "..." : "Follow"}
    </button>
  );
}

function FediverseFollowButton({ remoteActorId }: { remoteActorId: string }) {
  const [state, setState] = useState<"idle" | "loading" | "pending" | "following" | "error">("idle");

  async function handleFollow() {
    setState("loading");
    try {
      const res = await fetch(`${API_URL}/api/search/fediverse/follow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ remote_actor_id: remoteActorId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.data?.already_following) {
          setState("following");
        } else {
          setState(data.data?.status === "accepted" ? "following" : "pending");
        }
      } else if (res.status === 401) {
        setState("error");
      } else {
        setState("idle");
      }
    } catch {
      setState("idle");
    }
  }

  if (state === "following") {
    return <span className="text-xs px-3 py-1 rounded-full border" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>Following</span>;
  }
  if (state === "pending") {
    return <span className="text-xs px-3 py-1 rounded-full border" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>Requested</span>;
  }
  if (state === "error") {
    return <span className="text-xs px-3 py-1 rounded-full border" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>Log in first</span>;
  }
  return (
    <button onClick={handleFollow} disabled={state === "loading"}
      className="text-xs px-3 py-1 rounded-full border font-medium transition-colors disabled:opacity-50"
      style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>
      {state === "loading" ? "..." : "Follow"}
    </button>
  );
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"users" | "entries" | "fediverse">("users");
  const [users, setUsers] = useState<SearchUser[]>([]);
  const [entries, setEntries] = useState<SearchEntry[]>([]);
  const [fediverseResult, setFediverseResult] = useState<FediverseResult | null>(null);
  const [fediverseError, setFediverseError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Detect fediverse handle and auto-switch tab
  const isFediverseHandle = /^@?[^@\s]+@[^@\s]+\.[^@\s]+$/.test(query.trim());

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setUsers([]);
      setEntries([]);
      setFediverseResult(null);
      setFediverseError(null);
      setHasSearched(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setFediverseError(null);
      try {
        if (tab === "fediverse") {
          const res = await fetch(`${API_URL}/api/search/fediverse?q=${encodeURIComponent(query.trim())}`);
          if (res.ok) {
            const data = await res.json();
            setFediverseResult(data.data ?? null);
          } else {
            const data = await res.json().catch(() => ({}));
            setFediverseResult(null);
            setFediverseError(data.error || "Not found");
          }
        } else {
          const res = await fetch(`${API_URL}/api/search?q=${encodeURIComponent(query.trim())}&type=${tab}`);
          if (res.ok) {
            const data = await res.json();
            if (tab === "users") setUsers(data.data ?? []);
            else setEntries(data.data ?? []);
          }
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
        setHasSearched(true);
      }
    }, tab === "fediverse" ? 600 : 350);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, tab]);

  const placeholders: Record<string, string> = {
    users: "Search for people...",
    entries: "Search for entries...",
    fediverse: "Enter a fediverse handle (e.g. user@mastodon.social)",
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-lg font-semibold mb-6">Search</h1>

        {/* Search input */}
        <div className="relative mb-4">
          {tab === "fediverse" ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: "var(--muted)" }}>
              <circle cx="12" cy="12" r="10"/>
              <line x1="2" y1="12" x2="22" y2="12"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: "var(--muted)" }}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          )}
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholders[tab]}
            className="w-full rounded-xl border px-4 py-3 pl-10 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--foreground)" }}
            autoFocus
          />
        </div>

        {/* Auto-detect hint */}
        {isFediverseHandle && tab !== "fediverse" && (
          <button
            onClick={() => setTab("fediverse")}
            className="text-xs mb-3 px-3 py-1.5 rounded-lg border transition-colors hover:border-[var(--accent)]"
            style={{ borderColor: "var(--border)", color: "var(--accent)", background: "var(--accent-light)" }}>
            Looks like a fediverse handle &mdash; search the fediverse?
          </button>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {(["users", "entries", "fediverse"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className="text-xs px-3 py-1 rounded-full border font-medium transition-colors"
              style={{
                borderColor: tab === t ? "var(--accent)" : "var(--border)",
                background: tab === t ? "var(--accent-light)" : "transparent",
                color: tab === t ? "var(--accent)" : "var(--muted)",
              }}>
              {t === "users" ? "People" : t === "entries" ? "Entries" : "Fediverse"}
            </button>
          ))}
        </div>

        {/* Results */}
        {loading && (
          <p className="text-sm text-center py-8" style={{ color: "var(--muted)" }}>
            {tab === "fediverse" ? "Looking up on the fediverse..." : "Searching..."}
          </p>
        )}

        {/* Local users results */}
        {!loading && tab === "users" && (
          <>
            {users.length > 0 ? (
              <div className="rounded-2xl border overflow-hidden"
                style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                {users.map((user, i) => (
                  <div key={user.id}
                    className={`flex items-center gap-3 px-5 py-4 ${i < users.length - 1 ? "border-b" : ""}`}
                    style={{ borderColor: "var(--border)" }}>
                    <Link href={`/${user.username}`} className="flex-shrink-0">
                      <Avatar url={user.avatar_url} name={user.display_name} size={40} />
                    </Link>
                    <div className="flex-1 min-w-0">
                      <Link href={`/${user.username}`} className="hover:underline">
                        <p className="text-sm font-medium truncate">{user.display_name}</p>
                      </Link>
                      <p className="text-xs truncate" style={{ color: "var(--muted)" }}>@{user.username}</p>
                      {user.bio && (
                        <p className="text-xs mt-1 line-clamp-1" style={{ color: "var(--muted)" }}>{user.bio}</p>
                      )}
                    </div>
                    <FollowButton username={user.username} />
                  </div>
                ))}
              </div>
            ) : hasSearched && query.trim() ? (
              <div className="rounded-2xl border p-8 text-center"
                style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                <p className="text-sm" style={{ color: "var(--muted)" }}>No people found for &ldquo;{query}&rdquo;</p>
              </div>
            ) : null}
          </>
        )}

        {/* Entries results */}
        {!loading && tab === "entries" && (
          <>
            {entries.length > 0 ? (
              <div className="rounded-2xl border overflow-hidden"
                style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                {entries.map((entry, i) => (
                  <Link key={entry.id}
                    href={`/${entry.author.username}/${entry.slug}`}
                    className={`block px-5 py-4 transition-colors hover:bg-[var(--surface-hover)] ${i < entries.length - 1 ? "border-b" : ""}`}
                    style={{ borderColor: "var(--border)" }}>
                    <div className="flex items-center gap-2 mb-1">
                      <Avatar url={entry.author.avatar_url} name={entry.author.display_name} size={20} />
                      <span className="text-xs" style={{ color: "var(--muted)" }}>
                        {entry.author.display_name} · @{entry.author.username}
                      </span>
                    </div>
                    {entry.title && (
                      <p className="text-sm font-medium mb-1"
                        style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
                        {entry.title}
                      </p>
                    )}
                    <div className="text-xs line-clamp-2" style={{ color: "var(--muted)" }}
                      dangerouslySetInnerHTML={{ __html: entry.body_html }} />
                  </Link>
                ))}
              </div>
            ) : hasSearched && query.trim() ? (
              <div className="rounded-2xl border p-8 text-center"
                style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                <p className="text-sm" style={{ color: "var(--muted)" }}>No entries found for &ldquo;{query}&rdquo;</p>
              </div>
            ) : null}
          </>
        )}

        {/* Fediverse results */}
        {!loading && tab === "fediverse" && (
          <>
            {!hasSearched && !query.trim() && (
              <div className="rounded-2xl border p-8 text-center"
                style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                <div className="mb-3">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                    className="mx-auto" style={{ color: "var(--muted)" }}>
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="2" y1="12" x2="22" y2="12"/>
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                  </svg>
                </div>
                <p className="text-sm font-medium mb-1">Search the fediverse</p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  Enter a fediverse handle like <code className="px-1 py-0.5 rounded text-xs"
                    style={{ background: "var(--surface-hover)" }}>user@mastodon.social</code> to find and follow people across the fediverse
                </p>
              </div>
            )}

            {fediverseResult && (
              <div className="rounded-2xl border overflow-hidden"
                style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                <div className="flex items-center gap-3 px-5 py-5">
                  <a href={fediverseResult.profile_url} target="_blank" rel="noopener noreferrer"
                    className="flex-shrink-0">
                    <Avatar url={fediverseResult.avatar_url} name={fediverseResult.display_name || fediverseResult.username} size={48} />
                  </a>
                  <div className="flex-1 min-w-0">
                    <a href={fediverseResult.profile_url} target="_blank" rel="noopener noreferrer"
                      className="hover:underline">
                      <p className="text-sm font-medium truncate">
                        {fediverseResult.display_name || fediverseResult.username}
                      </p>
                    </a>
                    <p className="text-xs truncate" style={{ color: "var(--muted)" }}>
                      @{fediverseResult.username}@{fediverseResult.domain}
                    </p>
                  </div>
                  <FediverseFollowButton remoteActorId={fediverseResult.id} />
                </div>
              </div>
            )}

            {fediverseError && hasSearched && (
              <div className="rounded-2xl border p-8 text-center"
                style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                <p className="text-sm" style={{ color: "var(--muted)" }}>{fediverseError}</p>
                <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
                  Make sure the handle is correct (e.g. user@mastodon.social)
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
