"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { AvatarWithFrame, Avatar } from "@/components/avatar-with-frame";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SearchUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  avatar_frame?: string | null;
  avatar_animation?: string | null;
  subscription_tier?: string;
  ink_donor_status?: string;
  bio: string | null;
}

interface SearchEntry {
  id: string;
  slug: string;
  title: string | null;
  body_html: string;
  published_at: string;
  category?: string | null;
  word_count?: number | null;
  ink_count?: number;
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
  relationship_status?: "pending" | "accepted" | null;
}

// ─── Follow Button (local writers) ──────────────────────────────────────────

function FollowButton({ username }: { username: string }) {
  const [state, setState] = useState<"idle" | "loading" | "pending" | "following">("idle");

  async function handleFollow(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
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
    return <span className="explore-follow-btn explore-follow-btn--muted">Pen Pal</span>;
  }
  if (state === "pending") {
    return <span className="explore-follow-btn explore-follow-btn--muted">Requested</span>;
  }
  return (
    <button onClick={handleFollow} disabled={state === "loading"} className="explore-follow-btn">
      {state === "loading" ? "..." : "Follow"}
    </button>
  );
}

// ─── Follow Button (fediverse) ──────────────────────────────────────────────

function FediverseFollowButton({ remoteActorId, initialStatus }: {
  remoteActorId: string;
  initialStatus?: "pending" | "accepted" | null;
}) {
  const [state, setState] = useState<"idle" | "loading" | "pending" | "following" | "error">(() => {
    if (initialStatus === "accepted") return "following";
    if (initialStatus === "pending") return "pending";
    return "idle";
  });
  const pollRef = useRef<ReturnType<typeof setInterval>>(null);

  useEffect(() => {
    if (state !== "pending") return;
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      if (attempts > 10) {
        if (pollRef.current) clearInterval(pollRef.current);
        return;
      }
      try {
        const res = await fetch(`/api/search/fediverse/follow`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ remote_actor_id: remoteActorId }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.data?.status === "accepted") {
            setState("following");
            if (pollRef.current) clearInterval(pollRef.current);
          }
        }
      } catch { /* ignore */ }
    }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [state, remoteActorId]);

  async function handleFollow(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setState("loading");
    try {
      const res = await fetch(`/api/search/fediverse/follow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remote_actor_id: remoteActorId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.data?.status === "accepted" || data.data?.already_following) {
          setState("following");
        } else {
          setState("pending");
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

  if (state === "following") return <span className="explore-follow-btn explore-follow-btn--muted">Following</span>;
  if (state === "pending") return <span className="explore-follow-btn explore-follow-btn--muted">Requested</span>;
  if (state === "error") return <span className="explore-follow-btn explore-follow-btn--muted">Log in first</span>;
  return (
    <button onClick={handleFollow} disabled={state === "loading"} className="explore-follow-btn">
      {state === "loading" ? "..." : "Follow"}
    </button>
  );
}

// ─── Utility ────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", year: "numeric" });
  } catch { return ""; }
}

function readingTime(wordCount?: number | null): string | null {
  if (!wordCount) return null;
  const mins = Math.max(1, Math.round(wordCount / 250));
  return `${mins} min read`;
}

const FEDIVERSE_HANDLE_RE = /^@?[^@\s]+@[^@\s]+\.[^@\s]+$/;

// ─── Section Loading Indicator ──────────────────────────────────────────────

function SectionLoading({ label }: { label: string }) {
  return (
    <div className="explore-results-section">
      <div className="explore-results-section-header">
        <span className="explore-results-section-title">{label}</span>
      </div>
      <div className="explore-results-loading">
        <div className="explore-results-loading-dot" />
        <div className="explore-results-loading-dot" />
        <div className="explore-results-loading-dot" />
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

interface ExploreSearchResultsProps {
  query: string;
}

export function ExploreSearchResults({ query }: ExploreSearchResultsProps) {
  const [users, setUsers] = useState<SearchUser[]>([]);
  const [entries, setEntries] = useState<SearchEntry[]>([]);
  const [fediverseResult, setFediverseResult] = useState<FediverseResult | null>(null);
  const [fediverseError, setFediverseError] = useState<string | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [loadingFediverse, setLoadingFediverse] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const fedDebounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const isFediverseHandle = FEDIVERSE_HANDLE_RE.test(query.trim());

  useEffect(() => {
    if (!query.trim()) {
      setUsers([]);
      setEntries([]);
      setFediverseResult(null);
      setFediverseError(null);
      setHasSearched(false);
      return;
    }

    // Abort previous requests
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Fetch users + entries in parallel
    setLoadingUsers(true);
    setLoadingEntries(true);
    setHasSearched(false);

    const q = encodeURIComponent(query.trim());

    // Users
    fetch(`/api/search?q=${q}&type=users`, { signal: controller.signal })
      .then(res => res.ok ? res.json() : { data: [] })
      .then(data => { if (!controller.signal.aborted) setUsers(data.data ?? []); })
      .catch(() => {})
      .finally(() => { if (!controller.signal.aborted) setLoadingUsers(false); });

    // Entries
    fetch(`/api/search?q=${q}&type=entries`, { signal: controller.signal })
      .then(res => res.ok ? res.json() : { data: [] })
      .then(data => {
        if (!controller.signal.aborted) {
          setEntries((data.data ?? []).filter((e: SearchEntry) => e.author));
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadingEntries(false);
          setHasSearched(true);
        }
      });

    // Fediverse (only if handle detected, with extra debounce)
    if (isFediverseHandle) {
      if (fedDebounceRef.current) clearTimeout(fedDebounceRef.current);
      setLoadingFediverse(true);
      setFediverseResult(null);
      setFediverseError(null);

      fedDebounceRef.current = setTimeout(() => {
        fetch(`/api/search/fediverse?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal })
          .then(async res => {
            if (res.ok) {
              const data = await res.json();
              if (!controller.signal.aborted) setFediverseResult(data.data ?? null);
            } else {
              const data = await res.json().catch(() => ({}));
              if (!controller.signal.aborted) {
                setFediverseResult(null);
                setFediverseError(data.error || "Not found");
              }
            }
          })
          .catch(() => {})
          .finally(() => { if (!controller.signal.aborted) setLoadingFediverse(false); });
      }, 250); // Extra 250ms on top of the 350ms debounce in the search bar
    } else {
      setFediverseResult(null);
      setFediverseError(null);
      setLoadingFediverse(false);
    }

    return () => {
      controller.abort();
      if (fedDebounceRef.current) clearTimeout(fedDebounceRef.current);
    };
  }, [query, isFediverseHandle]);

  if (!query.trim()) return null;

  const isLoading = loadingUsers || loadingEntries;
  const noResults = hasSearched && !isLoading && users.length === 0 && entries.length === 0 && !fediverseResult && !loadingFediverse;

  return (
    <div className="explore-search-results" aria-live="polite">
      {/* ─── Writers ─── */}
      {loadingUsers && <SectionLoading label="Writers" />}
      {!loadingUsers && users.length > 0 && (
        <div className="explore-results-section">
          <div className="explore-results-section-header">
            <span className="explore-results-section-title">
              Writers
              <span className="explore-results-count">({users.length})</span>
            </span>
          </div>
          <div className="explore-results-writers">
            {users.slice(0, 6).map((user) => (
              <Link
                key={user.id}
                href={`/${user.username}`}
                className="explore-writer-card"
              >
                <AvatarWithFrame
                  url={user.avatar_url}
                  name={user.display_name}
                  size={40}
                  frame={user.avatar_frame}
                  animation={user.avatar_animation}
                  subscriptionTier={user.subscription_tier}
                />
                <div className="explore-writer-info">
                  <span className="explore-writer-name">
                    {user.display_name}
                    {user.ink_donor_status === "active" && (
                      <span className="explore-writer-donor" title="Ink Donor">
                        <svg width="10" height="12" viewBox="0 0 16 20" fill="currentColor" aria-hidden="true">
                          <path d="M8 1C8 1 1 8.5 1 12.5a7 7 0 0 0 14 0C15 8.5 8 1 8 1Z" />
                        </svg>
                      </span>
                    )}
                  </span>
                  <span className="explore-writer-handle">@{user.username}</span>
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <FollowButton username={user.username} />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ─── Entries ─── */}
      {loadingEntries && !loadingUsers && <SectionLoading label="Entries" />}
      {!loadingEntries && entries.length > 0 && (
        <div className="explore-results-section">
          <div className="explore-results-section-header">
            <span className="explore-results-section-title">
              Entries
              <span className="explore-results-count">({entries.length})</span>
            </span>
          </div>
          <div className="explore-results-entries">
            {entries.slice(0, 8).map((entry) => (
              <Link
                key={entry.id}
                href={`/${entry.author.username}/${entry.slug}`}
                className="explore-entry-row"
              >
                <Avatar url={entry.author.avatar_url} name={entry.author.display_name} size={24} />
                <div className="explore-entry-info">
                  <span className="explore-entry-title">
                    {entry.title || "Untitled"}
                  </span>
                  <span className="explore-entry-meta">
                    @{entry.author.username}
                    {readingTime(entry.word_count) && (
                      <> · {readingTime(entry.word_count)}</>
                    )}
                    {(entry.ink_count ?? 0) > 0 && (
                      <span className="explore-entry-ink">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <path d="M12 2C12 2 4 12.5 4 16.5C4 20.09 7.58 22 12 22C16.42 22 20 20.09 20 16.5C20 12.5 12 2 12 2Z" />
                        </svg>
                        {entry.ink_count}
                      </span>
                    )}
                  </span>
                </div>
                <span className="explore-entry-date">{formatDate(entry.published_at)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ─── Fediverse ─── */}
      {loadingFediverse && <SectionLoading label="Fediverse" />}
      {!loadingFediverse && fediverseResult && (
        <div className="explore-results-section explore-results-section--fediverse">
          <div className="explore-results-section-header">
            <span className="explore-results-section-title">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className="inline -mt-px mr-1" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <path d="M2 12h20" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              Found on {fediverseResult.domain}
            </span>
          </div>
          <div className="explore-fediverse-card">
            <a href={fediverseResult.profile_url} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
              <AvatarWithFrame
                url={fediverseResult.avatar_url}
                name={fediverseResult.display_name || fediverseResult.username}
                size={48}
              />
            </a>
            <div className="explore-fediverse-info">
              <a
                href={fediverseResult.profile_url}
                target="_blank"
                rel="noopener noreferrer"
                className="explore-fediverse-name"
              >
                {fediverseResult.display_name || fediverseResult.username}
              </a>
              <span className="explore-fediverse-handle">
                @{fediverseResult.username}@{fediverseResult.domain}
              </span>
            </div>
            <FediverseFollowButton
              remoteActorId={fediverseResult.id}
              initialStatus={fediverseResult.relationship_status}
            />
          </div>
          <a
            href={fediverseResult.profile_url}
            target="_blank"
            rel="noopener noreferrer"
            className="explore-fediverse-link"
          >
            Visit on {fediverseResult.domain}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        </div>
      )}
      {!loadingFediverse && fediverseError && isFediverseHandle && hasSearched && (
        <div className="explore-results-section explore-results-section--fediverse">
          <div className="explore-results-section-header">
            <span className="explore-results-section-title">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className="inline -mt-px mr-1" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
              </svg>
              Fediverse
            </span>
          </div>
          <p className="explore-fediverse-error">{fediverseError}</p>
          <p className="explore-fediverse-error-hint">
            Make sure the handle is correct (e.g. user@mastodon.social)
          </p>
        </div>
      )}

      {/* ─── No results ─── */}
      {noResults && (
        <div className="explore-no-results">
          <p className="explore-no-results-title">
            Nothing in the index for &ldquo;{query}&rdquo;
          </p>
          <p className="explore-no-results-text">
            Try a different name, topic, or a fediverse handle like @user@mastodon.social
          </p>
        </div>
      )}
    </div>
  );
}
