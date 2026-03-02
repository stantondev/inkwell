"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { JournalEntryCard, type JournalEntry } from "./journal-entry-card";
import { FeedCardActions } from "./feed-card-actions";

/** Session info passed from server to enable interactive features */
export interface FeedSession {
  userId: string;
  isLoggedIn: boolean;
  isPlus: boolean;
}

interface JournalFeedProps {
  entries: JournalEntry[];
  page: number;
  basePath: string;
  /** API proxy path for client-side "Load more" (e.g. "/api/feed") */
  loadMorePath?: string;
  /** Extra query params to append to pagination links (e.g. "&category=poetry") */
  extraParams?: string;
  emptyState?: React.ReactNode;
  /** If provided, enables interactive stamp + comment on feed cards */
  session?: FeedSession | null;
}

export function JournalFeed({
  entries: initialEntries,
  page,
  basePath,
  loadMorePath,
  extraParams = "",
  emptyState,
  session,
}: JournalFeedProps) {
  const [entries, setEntries] = useState(initialEntries);
  const [currentPage, setCurrentPage] = useState(page);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialEntries.length === 20);
  const prefersReducedMotion = usePrefersReducedMotion();

  const loadMore = useCallback(async () => {
    if (loading || !hasMore || !loadMorePath) return;
    setLoading(true);
    try {
      const nextPage = currentPage + 1;
      const separator = loadMorePath.includes("?") ? "&" : "?";
      const res = await fetch(`${loadMorePath}${separator}page=${nextPage}`);
      if (res.ok) {
        const { data } = await res.json();
        if (!data || data.length < 20) setHasMore(false);
        if (data && data.length > 0) {
          setEntries((prev) => {
            const existingIds = new Set(prev.map((e) => e.id));
            const newEntries = data.filter(
              (e: JournalEntry) => !existingIds.has(e.id)
            );
            return [...prev, ...newEntries];
          });
          setCurrentPage(nextPage);
        }
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, currentPage, loadMorePath]);

  if (entries.length === 0) {
    return <>{emptyState}</>;
  }

  // Build actions footer for an entry (if session is available)
  function renderActions(entry: JournalEntry) {
    const isRemote = entry.source === "remote";
    const entryHref = isRemote
      ? (entry.url ?? `/${entry.author.username}/${entry.id}`)
      : `/${entry.author.username}/${entry.slug ?? entry.id}`;
    const isOwnEntry = session ? entry.author.id === session.userId : false;

    return (
      <FeedCardActions
        entryId={entry.id}
        entryHref={entryHref}
        commentCount={entry.comment_count ?? 0}
        stamps={entry.stamps ?? []}
        myStamp={entry.my_stamp ?? null}
        bookmarked={entry.bookmarked ?? false}
        inkCount={entry.ink_count ?? 0}
        myInk={entry.my_ink ?? false}
        isOwnEntry={isOwnEntry}
        isLoggedIn={session?.isLoggedIn ?? false}
        isPlus={session?.isPlus ?? false}
        isRemote={isRemote}
        {...(isRemote
          ? {
              stampApiPath: `/api/remote-entries/${entry.id}/stamp`,
              commentApiPath: `/api/remote-entries/${entry.id}/comments`,
              inkApiPath: `/api/remote-entries/${entry.id}/ink`,
              externalUrl: entry.url,
              externalDomain: entry.author.domain,
            }
          : {})}
      />
    );
  }

  return (
    <div>
      {/* Masonry grid */}
      <div className="journal-grid" role="feed" aria-label="Journal entries">
        {entries.map((entry) => (
          <div key={entry.id} className="journal-grid-item">
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            >
              <JournalEntryCard
                entry={entry}
                actions={session ? renderActions(entry) : undefined}
              />
            </motion.div>
          </div>
        ))}
      </div>

      {/* Load more */}
      {hasMore && loadMorePath && (
        <div className="flex justify-center py-8">
          <button
            onClick={loadMore}
            disabled={loading}
            className="rounded-full px-6 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
            style={{
              background: "var(--accent)",
              color: "#fff",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "Loading..." : "Load more entries"}
          </button>
        </div>
      )}

      {/* Fallback: older entries link (server-side pagination for when no loadMorePath) */}
      {hasMore && !loadMorePath && (
        <div className="flex justify-center py-8">
          <Link
            href={`${basePath}?page=${page + 1}${extraParams}`}
            className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            Older entries
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </Link>
        </div>
      )}

      {/* Newer entries link (for direct URL navigation to page > 1) */}
      {page > 1 && (
        <div className="flex justify-center mt-2 pb-4">
          <Link
            href={`${basePath}?page=${page - 1}${extraParams}`}
            className="text-sm font-medium hover:underline"
            style={{ color: "var(--accent)" }}
          >
            &larr; Newer entries
          </Link>
        </div>
      )}
    </div>
  );
}
