"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { JournalEntryCard, type JournalEntry } from "./journal-entry-card";
import { FeedCardActions } from "./feed-card-actions";
import { PageNavigation } from "./page-navigation";

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
  emptyState?: React.ReactNode;
  /** If provided, enables interactive stamp + comment on feed cards */
  session?: FeedSession | null;
}

export function JournalFeed({
  entries,
  page,
  basePath,
  emptyState,
  session,
}: JournalFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [isDesktop, setIsDesktop] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();

  // Detect desktop for 2-page spread
  useEffect(() => {
    function check() {
      setIsDesktop(window.innerWidth >= 1024);
    }
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // On desktop, we show 2 entries per spread (like an open book)
  // On mobile/tablet, we show 1 entry per page
  const entriesPerPage = isDesktop ? 2 : 1;
  const totalPages = Math.ceil(entries.length / entriesPerPage);
  const hasMore = entries.length === 20;

  // Scroll to a specific page
  const navigateToPage = useCallback(
    (pageIndex: number) => {
      const container = scrollRef.current;
      if (!container) return;
      const pageWidth = container.clientWidth;
      container.scrollTo({ left: pageIndex * pageWidth, behavior: "smooth" });
    },
    []
  );

  // Track current page via scroll position
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    let ticking = false;
    function onScroll() {
      if (!ticking) {
        requestAnimationFrame(() => {
          if (container) {
            const pageWidth = container.clientWidth;
            const scrollPos = container.scrollLeft;
            const newPage = Math.round(scrollPos / pageWidth);
            setCurrentPage(newPage);
          }
          ticking = false;
        });
        ticking = true;
      }
    }

    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, []);

  if (entries.length === 0) {
    return <>{emptyState}</>;
  }

  // Build actions footer for an entry (if session is available)
  function renderActions(entry: JournalEntry) {
    const entryHref = `/${entry.author.username}/${entry.slug ?? entry.id}`;
    const isOwnEntry = session ? entry.author.id === session.userId : false;

    return (
      <FeedCardActions
        entryId={entry.id}
        entryHref={entryHref}
        commentCount={entry.comment_count ?? 0}
        stamps={entry.stamps ?? []}
        myStamp={entry.my_stamp ?? null}
        isOwnEntry={isOwnEntry}
        isLoggedIn={session?.isLoggedIn ?? false}
        isPlus={session?.isPlus ?? false}
      />
    );
  }

  // Build pages: group entries based on desktop/mobile
  const pages: JournalEntry[][] = [];
  for (let i = 0; i < entries.length; i += entriesPerPage) {
    pages.push(entries.slice(i, i + entriesPerPage));
  }

  // Total navigable pages includes the "load more" sentinel if applicable
  const totalNavigable = hasMore ? pages.length + 1 : pages.length;

  return (
    <div className="journal-feed-container relative">
      {/* Scroll-snap container */}
      <div
        ref={scrollRef}
        className="journal-scroll"
        role="region"
        aria-roledescription="journal"
        aria-label="Journal entries"
        style={{ minHeight: "calc(100vh - 220px)" }}
      >
        {pages.map((pageEntries, pageIndex) => (
          <div
            key={pageIndex}
            className="journal-snap-page w-full flex-shrink-0 px-4 lg:px-8"
          >
            {isDesktop ? (
              /* Desktop: book spread with 2 entries + spine */
              <div
                className="flex gap-0 h-full mx-auto"
                style={{ maxWidth: "1400px" }}
              >
                {/* Left page */}
                <div className="flex-1 px-4 py-4 flex">
                  <motion.div
                    className="flex-1 flex"
                    initial={
                      prefersReducedMotion
                        ? false
                        : { opacity: 0, y: 16 }
                    }
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      delay: 0.05,
                      duration: 0.4,
                      ease: "easeOut",
                    }}
                  >
                    <div className="flex-1">
                      <JournalEntryCard
                        entry={pageEntries[0]}
                        actions={session ? renderActions(pageEntries[0]) : undefined}
                      />
                    </div>
                  </motion.div>
                </div>

                {/* Spine */}
                <div className="journal-spine hidden lg:block" />

                {/* Right page */}
                <div className="flex-1 px-4 py-4 flex">
                  {pageEntries[1] ? (
                    <motion.div
                      className="flex-1 flex"
                      initial={
                        prefersReducedMotion
                          ? false
                          : { opacity: 0, y: 16 }
                      }
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        delay: 0.15,
                        duration: 0.4,
                        ease: "easeOut",
                      }}
                    >
                      <div className="flex-1">
                        <JournalEntryCard
                          entry={pageEntries[1]}
                          actions={session ? renderActions(pageEntries[1]) : undefined}
                        />
                      </div>
                    </motion.div>
                  ) : (
                    /* If odd number of entries, empty right page */
                    <div className="flex-1 flex items-center justify-center">
                      <p
                        className="text-sm italic"
                        style={{ color: "var(--muted)" }}
                      >
                        &mdash;
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Mobile/Tablet: single entry per page */
              <div className="h-full py-4 mx-auto" style={{ maxWidth: "640px" }}>
                <motion.div
                  className="h-full"
                  initial={
                    prefersReducedMotion
                      ? false
                      : { opacity: 0, y: 12 }
                  }
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: 0.05,
                    duration: 0.35,
                    ease: "easeOut",
                  }}
                >
                  <JournalEntryCard
                    entry={pageEntries[0]}
                    actions={session ? renderActions(pageEntries[0]) : undefined}
                  />
                </motion.div>
              </div>
            )}
          </div>
        ))}

        {/* Load more sentinel */}
        {hasMore && (
          <div className="journal-snap-page w-full flex-shrink-0 flex items-center justify-center">
            <div className="text-center">
              <p
                className="text-lg mb-4"
                style={{
                  fontFamily: "var(--font-lora, Georgia, serif)",
                  color: "var(--muted)",
                }}
              >
                Turn to the next chapter&hellip;
              </p>
              <Link
                href={`${basePath}?page=${page + 1}`}
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
          </div>
        )}
      </div>

      {/* Navigation overlay */}
      <PageNavigation
        currentPage={currentPage}
        totalPages={totalNavigable}
        onNavigate={navigateToPage}
      />

      {/* API page navigation (Newer / Older) */}
      {page > 1 && (
        <div className="flex justify-center mt-2">
          <Link
            href={`${basePath}?page=${page - 1}`}
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
