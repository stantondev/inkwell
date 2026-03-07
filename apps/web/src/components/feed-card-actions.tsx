"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { StampPicker } from "@/components/stamp-picker";
import { BookmarkButton } from "@/components/bookmark-button";
import { InkButton } from "@/components/ink-button";
import { FloatingPopup } from "@/components/floating-popup";
import { ReportModal } from "@/components/report-modal";
import { ShareButton } from "@/components/share-button";

interface FeedComment {
  id: string;
  body_html: string;
  created_at: string;
  author: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
}

interface FeedCardActionsProps {
  entryId: string;
  entryHref: string;
  commentCount: number;
  stamps: string[];
  myStamp: string | null;
  bookmarked: boolean;
  inkCount?: number;
  myInk?: boolean;
  isOwnEntry: boolean;
  isLoggedIn: boolean;
  isPlus: boolean;
  /** Override API paths for remote entries */
  stampApiPath?: string;
  commentApiPath?: string;
  bookmarkApiPath?: string;
  /** External URL for "View on {domain}" link */
  externalUrl?: string;
  externalDomain?: string;
  /** Override API path for remote entry inks */
  inkApiPath?: string;
  /** Whether this is a federated/remote entry */
  isRemote?: boolean;
  /** Entry title for share text */
  entryTitle?: string | null;
  /** Entry author username for share text */
  entryAuthorUsername?: string;
  onStampsChange?: (stamps: string[]) => void;
  onBookmarkChange?: (bookmarked: boolean) => void;
}

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function FeedCardActions({
  entryId,
  entryHref,
  commentCount: initialCommentCount,
  stamps: initialStamps,
  myStamp: initialMyStamp,
  bookmarked,
  isOwnEntry,
  isLoggedIn,
  isPlus,
  inkCount = 0,
  myInk = false,
  stampApiPath,
  commentApiPath,
  bookmarkApiPath,
  externalUrl,
  externalDomain,
  inkApiPath,
  isRemote = false,
  entryTitle,
  entryAuthorUsername,
  onStampsChange,
  onBookmarkChange,
}: FeedCardActionsProps) {
  const [commentPopupOpen, setCommentPopupOpen] = useState(false);
  const [comments, setComments] = useState<FeedComment[]>([]);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [commentError, setCommentError] = useState("");
  const [commentCount, setCommentCount] = useState(initialCommentCount);
  const [stamps, setStamps] = useState(initialStamps);
  const [reportOpen, setReportOpen] = useState(false);
  const commentBtnRef = useRef<HTMLButtonElement>(null);
  const submittingRef = useRef(false);

  const commentsPath = commentApiPath ?? `/api/entries/${entryId}/comments`;

  const loadComments = useCallback(async () => {
    try {
      const res = await fetch(commentsPath);
      if (res.ok) {
        const { data } = await res.json();
        setComments(data ?? []);
        setCommentsLoaded(true);
      }
    } catch {
      // silent fail
    }
  }, [commentsPath]);

  function handleCommentToggle() {
    if (!commentPopupOpen) {
      if (!commentsLoaded) loadComments();
    }
    setCommentPopupOpen(!commentPopupOpen);
  }

  async function handleSubmitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!commentText.trim() || submittingRef.current || !isLoggedIn) return;

    submittingRef.current = true;
    setSubmitting(true);
    setCommentError("");
    try {
      const res = await fetch(commentsPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body_html: `<p>${commentText}</p>` }),
      });
      if (res.ok) {
        setCommentText("");
        setCommentCount((c) => c + 1);
        // Reload comments to show the new one
        await loadComments();
      } else {
        try {
          const data = await res.json();
          setCommentError(data.error ?? "Failed to post comment");
        } catch {
          setCommentError("Failed to post comment");
        }
      }
    } catch {
      setCommentError("Network error — please try again");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  function handleStampChange(newStamps: string[], _newMyStamp: string | null) {
    setStamps(newStamps);
    onStampsChange?.(newStamps);
  }

  // Show last 3 comments
  const recentComments = comments.slice(-3);

  return (
    <div
      className="flex items-center justify-between px-4 sm:px-5 lg:px-6 py-2.5 border-t relative"
      style={{ borderColor: "var(--border)" }}
    >
      {/* Left: view on original instance (remote only) or spacer */}
      {externalUrl ? (
        <a
          href={externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium transition-colors hover:underline"
          style={{ color: "var(--accent)" }}
        >
          {externalDomain ? `View on ${externalDomain}` : "View original"} &rarr;
        </a>
      ) : (
        <span />
      )}

      {/* Right: Comment + Stamp actions */}
      <div className="flex items-center gap-4">
        {/* Comment button + popup */}
        <div>
          <button
            ref={commentBtnRef}
            onClick={handleCommentToggle}
            className="flex items-center gap-1.5 text-sm transition-colors cursor-pointer hover:opacity-80"
            style={{ color: "var(--muted)" }}
            title="Comments"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span>{commentCount}</span>
          </button>

          {/* Comment popup — rendered via portal to escape overflow containers */}
          <FloatingPopup
            anchorRef={commentBtnRef}
            open={commentPopupOpen}
            onClose={() => setCommentPopupOpen(false)}
            placement="top"
            className="rounded-xl border shadow-lg overflow-hidden"
            style={{
              background: "var(--surface)",
              borderColor: "var(--border)",
              width: "min(320px, calc(100vw - 32px))",
              maxHeight: 400,
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-2.5 border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <span className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>
                Comments
                {isRemote && (
                  <span className="ml-1.5 font-normal" style={{ color: "var(--muted)" }}>
                    (federated)
                  </span>
                )}
              </span>
              {!isRemote && (
                <Link
                  href={`${entryHref}#comments`}
                  className="text-xs hover:underline"
                  style={{ color: "var(--accent)" }}
                >
                  View all →
                </Link>
              )}
            </div>

            {/* Comments list */}
            <div
              className="overflow-y-auto px-4 py-2"
              style={{ maxHeight: 240 }}
            >
              {!commentsLoaded ? (
                <p className="text-xs py-4 text-center" style={{ color: "var(--muted)" }}>
                  Loading...
                </p>
              ) : recentComments.length === 0 ? (
                <p className="text-xs py-4 text-center" style={{ color: "var(--muted)" }}>
                  No comments yet. Be the first!
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {recentComments.map((c) => (
                    <div key={c.id} className="flex gap-2">
                      {c.author && (
                        <Link href={`/${c.author.username}`} className="flex-shrink-0">
                          <Avatar
                            url={c.author.avatar_url}
                            name={c.author.display_name}
                            size={24}
                          />
                        </Link>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-1.5">
                          {c.author && (
                            <Link
                              href={`/${c.author.username}`}
                              className="text-xs font-medium hover:underline"
                            >
                              {c.author.display_name}
                            </Link>
                          )}
                          <span className="text-[10px]" style={{ color: "var(--muted)" }}>
                            {timeAgo(c.created_at)}
                          </span>
                        </div>
                        <div
                          className="text-xs leading-relaxed mt-0.5 prose-entry"
                          style={{ color: "var(--foreground)" }}
                          dangerouslySetInnerHTML={{ __html: c.body_html }}
                        />
                      </div>
                    </div>
                  ))}
                  {comments.length > 3 && !isRemote && (
                    <Link
                      href={`${entryHref}#comments`}
                      className="text-xs text-center py-1 hover:underline"
                      style={{ color: "var(--accent)" }}
                    >
                      +{comments.length - 3} more
                    </Link>
                  )}
                  {comments.length > 3 && isRemote && (
                    <p
                      className="text-xs text-center py-1"
                      style={{ color: "var(--muted)" }}
                    >
                      +{comments.length - 3} more
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Quick comment input */}
            {isLoggedIn ? (
              <div className="border-t" style={{ borderColor: "var(--border)" }}>
                {commentError && (
                  <p className="text-xs px-4 pt-2" style={{ color: "var(--danger)" }}>{commentError}</p>
                )}
                <form
                  onSubmit={handleSubmitComment}
                  className="flex gap-2 px-4 py-2.5"
                >
                  <input
                    type="text"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Add a comment..."
                    className="flex-1 text-xs rounded-full border px-3 py-1.5 outline-none"
                    style={{
                      borderColor: "var(--border)",
                      background: "var(--background)",
                      color: "var(--foreground)",
                    }}
                    disabled={submitting}
                  />
                  <button
                    type="submit"
                    disabled={!commentText.trim() || submitting}
                    className="text-xs font-medium px-3 py-1.5 rounded-full transition-opacity"
                    style={{
                      background: "var(--accent)",
                      color: "#fff",
                      opacity: !commentText.trim() || submitting ? 0.5 : 1,
                    }}
                  >
                    Post
                  </button>
                </form>
              </div>
            ) : (
              <div className="border-t px-4 py-3 text-center" style={{ borderColor: "var(--border)" }}>
                <a href="/get-started" className="text-xs font-medium hover:underline" style={{ color: "var(--accent)" }}>
                  Join Inkwell
                </a>{" "}
                <span className="text-xs" style={{ color: "var(--muted)" }}>to leave a comment.</span>
              </div>
            )}
          </FloatingPopup>
        </div>

        {/* Ink button */}
        <InkButton
          entryId={entryId}
          initialInked={myInk}
          initialCount={inkCount}
          isOwnEntry={isOwnEntry}
          isLoggedIn={isLoggedIn}
          apiPath={inkApiPath}
        />

        {/* Stamp button */}
        <StampPicker
          entryId={entryId}
          currentStamp={initialMyStamp}
          isOwnEntry={isOwnEntry}
          isLoggedIn={isLoggedIn}
          isPlus={isPlus}
          compact
          stampApiPath={stampApiPath}
          onStampChange={handleStampChange}
        />

        {/* Bookmark button — not available for federated entries */}
        {!isRemote && (
          <BookmarkButton
            entryId={entryId}
            initialBookmarked={bookmarked}
            isLoggedIn={isLoggedIn}
            bookmarkApiPath={bookmarkApiPath}
            onBookmarkChange={onBookmarkChange}
          />
        )}

        {/* Share button */}
        <ShareButton
          url={externalUrl || `https://inkwell.social${entryHref}`}
          title={entryTitle || "Entry"}
          description={entryTitle ? `"${entryTitle}" on Inkwell` : "A journal entry on Inkwell"}
        />

        {/* Report button — only for other users' non-remote entries */}
        {!isOwnEntry && !isRemote && isLoggedIn && (
          <button
            onClick={() => setReportOpen(true)}
            className="flex items-center transition-opacity hover:opacity-80 cursor-pointer"
            style={{ color: "var(--muted)" }}
            title="Report"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
              <line x1="4" y1="22" x2="4" y2="15" />
            </svg>
          </button>
        )}
      </div>

      {/* Report modal */}
      {reportOpen && (
        <ReportModal entryId={entryId} onClose={() => setReportOpen(false)} />
      )}
    </div>
  );
}
