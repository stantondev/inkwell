"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { JournalEntryCard, type JournalEntry } from "./journal-entry-card";
import { FeedCardActions } from "./feed-card-actions";
import { MobileSwipeableCard } from "./mobile-swipeable-card";

interface TranslationData {
  translated_title: string | null;
  translated_body: string;
  source_language: string;
}

/** Session info passed from server to enable interactive features */
export interface FeedSession {
  userId: string;
  username: string;
  isLoggedIn: boolean;
  isPlus: boolean;
  isAdmin?: boolean;
  preferredLanguage?: string | null;
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
  // Track active translations per entry ID
  const [translations, setTranslations] = useState<Record<string, TranslationData>>({});
  // Mobile detection for swipe gestures
  const [isMobile, setIsMobile] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const { refreshing, pullDistance } = usePullToRefresh({
    onRefresh: () => router.refresh(),
    enabled: isMobile,
  });

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

  // Mobile swipe actions
  const toggleInk = useCallback(async (entryId: string, isRemote: boolean) => {
    if (!session?.isLoggedIn) return;
    const path = isRemote ? `/api/remote-entries/${entryId}/ink` : `/api/entries/${entryId}/ink`;
    try {
      const res = await fetch(path, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setEntries(prev => prev.map(e =>
          e.id === entryId ? { ...e, my_ink: data.inked, ink_count: data.ink_count } : e
        ));
      }
    } catch { /* silent */ }
  }, [session?.isLoggedIn]);

  const toggleBookmark = useCallback(async (entryId: string) => {
    if (!session?.isLoggedIn) return;
    try {
      const res = await fetch(`/api/entries/${entryId}/bookmark`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setEntries(prev => prev.map(e =>
          e.id === entryId ? { ...e, bookmarked: data.bookmarked } : e
        ));
      }
    } catch { /* silent */ }
  }, [session?.isLoggedIn]);

  // Handle translation callback from feed card actions
  function handleTranslation(entryId: string, translation: TranslationData | null) {
    setTranslations((prev) => {
      if (translation) {
        return { ...prev, [entryId]: translation };
      } else {
        const next = { ...prev };
        delete next[entryId];
        return next;
      }
    });
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
        entryTitle={entry.title}
        entryAuthorUsername={entry.author.username}
        preferredLanguage={session?.preferredLanguage}
        sessionUser={session ? { id: session.userId, username: session.username, is_admin: session.isAdmin } : null}
        onTranslation={(t) => handleTranslation(entry.id, t)}
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

  const renderCard = (entry: JournalEntry) => {
    const isRemote = entry.source === "remote";
    const isOwnEntry = session ? entry.author.id === session.userId : false;
    const card = (
      <JournalEntryCard
        entry={entry}
        actions={session ? renderActions(entry) : undefined}
        translatedBody={translations[entry.id]?.translated_body ?? null}
        translatedTitle={translations[entry.id]?.translated_title ?? null}
      />
    );

    // Wrap in swipeable on mobile for logged-in, non-own, non-remote entries
    if (isMobile && session?.isLoggedIn && !isOwnEntry) {
      return (
        <MobileSwipeableCard
          onSwipeLeft={() => toggleInk(entry.id, isRemote)}
          onSwipeRight={() => toggleBookmark(entry.id)}
          leftActive={entry.bookmarked ?? false}
          rightActive={entry.my_ink ?? false}
          leftLabel="Bookmark"
          rightLabel="Ink"
        >
          {card}
        </MobileSwipeableCard>
      );
    }
    return card;
  };

  return (
    <div>
      {/* Pull-to-refresh indicator (mobile only) */}
      {isMobile && (pullDistance > 0 || refreshing) && (
        <div className="pull-to-refresh-indicator" style={{ height: pullDistance || (refreshing ? 40 : 0) }}>
          {refreshing ? (
            <svg className="pull-to-refresh-spinner" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          ) : (
            <svg
              width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: `rotate(${Math.min(pullDistance / 40 * 180, 180)}deg)`, transition: "transform 0.1s" }}
            >
              <polyline points="7 13 12 18 17 13" />
              <line x1="12" y1="6" x2="12" y2="18" />
            </svg>
          )}
        </div>
      )}

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
              {renderCard(entry)}
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
