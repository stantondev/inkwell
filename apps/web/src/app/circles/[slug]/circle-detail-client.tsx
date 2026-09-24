"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import MemberStrip from "./member-strip";
import MembersSection from "./members-section";
import DiscussionCard from "./discussion-card";
import CircleEntryCard from "./circle-entry-card";
import { ShareButton } from "@/components/share-button";
import { CATEGORY_LABELS, type Circle, type CircleEntry } from "../circle-types";

interface Discussion {
  id: string;
  title: string;
  body: string;
  is_prompt: boolean;
  is_pinned: boolean;
  is_locked: boolean;
  response_count: number;
  last_response_at: string | null;
  inserted_at: string;
  circle_id: string;
  author: { id: string; username: string; display_name: string; avatar_url: string | null } | null;
}

export default function CircleDetailClient({
  circle,
  isLoggedIn,
  currentUserId,
  shareUrl,
}: {
  circle: Circle;
  isLoggedIn: boolean;
  currentUserId: string | null;
  shareUrl: string;
}) {
  const router = useRouter();
  const [isMember, setIsMember] = useState(!!circle.is_member);
  const [memberCount, setMemberCount] = useState(circle.member_count);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");

  const [entries, setEntries] = useState<CircleEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [promptFilter, setPromptFilter] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archive, setArchive] = useState<Discussion[] | null>(null);

  const prompt = circle.prompt ?? null;
  const isOwner = circle.viewer_role === "owner";
  const canModerate = circle.viewer_role === "owner" || circle.viewer_role === "moderator";

  // Entries posted to the circle. Members also get the members-only ones, so
  // this reloads when membership changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    const qs = new URLSearchParams({ page: String(page) });
    if (promptFilter && prompt) qs.set("prompt", prompt.id);

    fetch(`/api/circles/${circle.id}/entries?${qs}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data: { data: CircleEntry[]; pagination: { total: number } }) => {
        if (cancelled) return;
        setEntries((prev) => (page === 1 ? data.data : [...prev, ...data.data]));
        setTotal(data.pagination.total);
      })
      .catch(() => !cancelled && setLoadError(true))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [circle.id, page, promptFilter, prompt, isMember, reloadKey]);

  const reload = useCallback(() => {
    // Prompt/removal changes also change the header, so refresh server data too.
    setPage(1);
    setReloadKey((k) => k + 1);
    router.refresh();
  }, [router]);

  const handleJoin = async () => {
    if (!isLoggedIn) {
      router.push(`/login?next=${encodeURIComponent(`/circles/${circle.slug}`)}`);
      return;
    }
    setJoining(true);
    setJoinError("");
    try {
      const res = await fetch(`/api/circles/${circle.id}/join`, { method: "POST" });
      if (res.ok) {
        setIsMember(true);
        setMemberCount((c) => c + 1);
        setPage(1);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setJoinError(data.error || "Couldn't join the circle. Try again.");
      }
    } catch {
      setJoinError("Couldn't join the circle. Try again.");
    }
    setJoining(false);
  };

  const handleLeave = async () => {
    if (!window.confirm(`Leave ${circle.name}? Your posts stay in the circle.`)) return;
    setJoining(true);
    try {
      const res = await fetch(`/api/circles/${circle.id}/leave`, { method: "DELETE" });
      if (res.ok) {
        setIsMember(false);
        setMemberCount((c) => Math.max(0, c - 1));
        setPage(1);
        router.refresh();
      }
    } catch {
      // ignore
    }
    setJoining(false);
  };

  const clearPrompt = async () => {
    if (!window.confirm("Clear the prompt? The entry stays in the circle.")) return;
    const res = await fetch(`/api/circles/${circle.id}/prompt`, { method: "DELETE" });
    if (res.ok) {
      setPromptFilter(false);
      reload();
    }
  };

  const toggleArchive = async () => {
    const next = !archiveOpen;
    setArchiveOpen(next);
    if (next && archive === null) {
      try {
        const res = await fetch(`/api/circles/${circle.id}/discussions`);
        const data = res.ok ? await res.json() : { data: [] };
        setArchive(data.data || []);
      } catch {
        setArchive([]);
      }
    }
  };

  const writeHref = `/editor?circle=${circle.id}`;
  const entryCount = circle.entry_count ?? 0;

  return (
    <>
      <Link href="/circles" className="circle-back-link">
        ← All circles
      </Link>

      {/* Header */}
      <header style={{ marginBottom: "1.25rem" }}>
        <h1 className="circle-title">{circle.name}</h1>
        <div className="circle-header-meta">
          <span className="circle-category-pill">{CATEGORY_LABELS[circle.category] || circle.category}</span>
          <span>
            {memberCount} member{memberCount !== 1 ? "s" : ""} · {entryCount} post{entryCount !== 1 ? "s" : ""}
          </span>
          {circle.owner && (
            <span>
              Started by{" "}
              <Link href={`/${circle.owner.username}`} style={{ color: "var(--accent)", textDecoration: "none" }}>
                @{circle.owner.username}
              </Link>
            </span>
          )}
        </div>

        {circle.description && (
          <div
            className="prose-discussion"
            style={{ marginTop: "0.875rem" }}
            dangerouslySetInnerHTML={{ __html: circle.description }}
          />
        )}

        <div className="circle-actions">
          {isMember ? (
            <Link href={writeHref} className="circle-btn" style={{ textDecoration: "none" }}>
              Write in this circle
            </Link>
          ) : (
            <button onClick={handleJoin} disabled={joining} className="circle-btn">
              {joining ? "Joining…" : "Join circle"}
            </button>
          )}
          <ShareButton url={shareUrl} title={circle.name} description={`A circle on Inkwell`} />
          {isMember && !isOwner && (
            <button onClick={handleLeave} disabled={joining} className="circle-link-btn">
              Leave
            </button>
          )}
        </div>
        {joinError && <p className="circle-entry-error">{joinError}</p>}

        {!isMember && (
          <p className="circle-howto">
            Members post journal entries here. Each post stays on its writer&rsquo;s journal and shows up in every
            member&rsquo;s Feed; some are for members only. Join to read those and to post.
          </p>
        )}
      </header>

      {circle.member_preview && circle.member_preview.length > 0 && (
        <div style={{ marginBottom: "1.25rem" }}>
          <MemberStrip members={circle.member_preview} totalCount={memberCount} circleId={circle.id} isMember={isMember} />
        </div>
      )}

      {/* The prompt */}
      {prompt && (
        <section className="circle-prompt" aria-label="This circle's prompt">
          <div className="circle-prompt-label">This circle&rsquo;s prompt</div>
          <Link
            href={prompt.author ? `/${prompt.author.username}/${prompt.slug}` : "#"}
            className="circle-prompt-title"
          >
            {prompt.title || "Untitled"}
          </Link>
          {prompt.excerpt && <p className="circle-prompt-excerpt">{prompt.excerpt}</p>}
          <div className="circle-prompt-actions">
            {isMember ? (
              <Link href={`${writeHref}&circle_prompt=${prompt.id}`} className="circle-btn" style={{ textDecoration: "none" }}>
                Write about this
              </Link>
            ) : (
              <button onClick={handleJoin} className="circle-btn" disabled={joining}>
                Join to answer
              </button>
            )}
            {(prompt.response_count ?? 0) > 0 && (
              <button
                className="circle-link-btn"
                onClick={() => {
                  setPromptFilter((v) => !v);
                  setPage(1);
                }}
              >
                {promptFilter
                  ? "Show every post"
                  : `Read ${prompt.response_count} answer${prompt.response_count === 1 ? "" : "s"}`}
              </button>
            )}
            {canModerate && (
              <button className="circle-link-btn" onClick={clearPrompt}>
                Clear prompt
              </button>
            )}
          </div>
        </section>
      )}

      {/* Posts */}
      <section style={{ marginTop: "1.5rem" }}>
        <h2 className="circle-section-heading">{promptFilter ? "Answers to the prompt" : "Posts"}</h2>

        {loadError && entries.length === 0 ? (
          <p className="circle-empty">We couldn&rsquo;t load this circle&rsquo;s posts. Refresh to try again.</p>
        ) : loading && entries.length === 0 ? (
          <p className="circle-empty">Loading…</p>
        ) : entries.length === 0 ? (
          <div className="circle-empty-card">
            <p className="circle-empty-title">Nothing posted here yet</p>
            {isMember ? (
              <>
                <p className="circle-empty">
                  Write an entry and it&rsquo;ll appear here and in every member&rsquo;s Feed.
                  {canModerate ? " Then make it the circle's prompt to give everyone something to write about." : ""}
                </p>
                <Link href={writeHref} className="circle-btn" style={{ textDecoration: "none" }}>
                  Write the first post
                </Link>
              </>
            ) : (
              <p className="circle-empty">Join and write the first post.</p>
            )}
          </div>
        ) : (
          <>
            {entries.map((e) => (
              <CircleEntryCard
                key={e.id}
                entry={e}
                circleId={circle.id}
                canModerate={canModerate}
                currentUserId={currentUserId}
                onChanged={reload}
              />
            ))}
            {entries.length < total && (
              <div style={{ textAlign: "center", marginTop: "1rem" }}>
                <button className="circle-btn circle-btn--outline" disabled={loading} onClick={() => setPage((p) => p + 1)}>
                  {loading ? "Loading…" : "Older posts"}
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {isMember && (
        <>
          <div className="circle-divider" />
          <MembersSection
            circleId={circle.id}
            isOwner={isOwner}
            memberCount={memberCount}
            onMemberCountChange={setMemberCount}
          />
        </>
      )}

      {/* The first version's discussions, read-only */}
      {circle.has_archive && (
        <section style={{ marginTop: "1.5rem" }}>
          <button className="circle-members-toggle" onClick={toggleArchive} aria-expanded={archiveOpen}>
            {archiveOpen ? "▾" : "▸"} Earlier discussions ({circle.discussion_count})
          </button>
          {archiveOpen && (
            <div style={{ marginTop: "0.75rem" }}>
              <p className="circle-empty" style={{ marginBottom: "0.75rem" }}>
                From before circles used journal entries. You can still read them.
              </p>
              {archive === null ? (
                <p className="circle-empty">Loading…</p>
              ) : (
                archive.map((d) => <DiscussionCard key={d.id} discussion={d} circleSlug={circle.slug} />)
              )}
            </div>
          )}
        </section>
      )}
    </>
  );
}
