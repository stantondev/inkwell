"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { StampPicker } from "@/components/stamp-picker";

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
  isOwnEntry: boolean;
  isLoggedIn: boolean;
  isPlus: boolean;
  onStampsChange?: (stamps: string[]) => void;
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
  isOwnEntry,
  isLoggedIn,
  isPlus,
  onStampsChange,
}: FeedCardActionsProps) {
  const [commentPopupOpen, setCommentPopupOpen] = useState(false);
  const [comments, setComments] = useState<FeedComment[]>([]);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [commentCount, setCommentCount] = useState(initialCommentCount);
  const [stamps, setStamps] = useState(initialStamps);
  const popupRef = useRef<HTMLDivElement>(null);
  const [popupAlign, setPopupAlign] = useState<"left" | "right">("right");
  const commentBtnRef = useRef<HTMLButtonElement>(null);

  // Close popup on outside click
  useEffect(() => {
    if (!commentPopupOpen) return;
    function handleClick(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setCommentPopupOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [commentPopupOpen]);

  const loadComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/entries/${entryId}/comments`);
      if (res.ok) {
        const { data } = await res.json();
        setComments(data ?? []);
        setCommentsLoaded(true);
      }
    } catch {
      // silent fail
    }
  }, [entryId]);

  function handleCommentToggle() {
    if (!commentPopupOpen) {
      // Determine alignment
      if (commentBtnRef.current) {
        const rect = commentBtnRef.current.getBoundingClientRect();
        setPopupAlign(rect.left < window.innerWidth / 2 ? "left" : "right");
      }
      if (!commentsLoaded) loadComments();
    }
    setCommentPopupOpen(!commentPopupOpen);
  }

  async function handleSubmitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!commentText.trim() || submitting || !isLoggedIn) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/entries/${entryId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body_html: `<p>${commentText}</p>` }),
      });
      if (res.ok) {
        setCommentText("");
        setCommentCount((c) => c + 1);
        // Reload comments to show the new one
        await loadComments();
      }
    } catch {
      // silent fail
    } finally {
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
      className="flex items-center justify-between px-6 lg:px-8 py-3 border-t relative"
      style={{ borderColor: "var(--border)" }}
    >
      {/* Left: Read full entry */}
      <Link
        href={entryHref}
        className="text-sm font-medium transition-colors hover:underline"
        style={{ color: "var(--accent)" }}
      >
        Read &rarr;
      </Link>

      {/* Right: Comment + Stamp actions */}
      <div className="flex items-center gap-4">
        {/* Comment button + popup */}
        <div ref={popupRef} className="relative">
          <button
            ref={commentBtnRef}
            onClick={handleCommentToggle}
            className="flex items-center gap-1.5 text-sm transition-colors"
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

          {/* Comment popup */}
          {commentPopupOpen && (
            <div
              className="absolute bottom-full mb-2 z-50 rounded-xl border shadow-lg overflow-hidden"
              style={{
                background: "var(--surface)",
                borderColor: "var(--border)",
                width: 320,
                maxHeight: 400,
                ...(popupAlign === "right" ? { right: 0 } : { left: 0 }),
              }}
            >
              {/* Header */}
              <div
                className="flex items-center justify-between px-4 py-2.5 border-b"
                style={{ borderColor: "var(--border)" }}
              >
                <span className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>
                  Comments
                </span>
                <Link
                  href={`${entryHref}#comments`}
                  className="text-xs hover:underline"
                  style={{ color: "var(--accent)" }}
                >
                  View all →
                </Link>
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
                    {comments.length > 3 && (
                      <Link
                        href={`${entryHref}#comments`}
                        className="text-xs text-center py-1 hover:underline"
                        style={{ color: "var(--accent)" }}
                      >
                        +{comments.length - 3} more
                      </Link>
                    )}
                  </div>
                )}
              </div>

              {/* Quick comment input */}
              {isLoggedIn && (
                <form
                  onSubmit={handleSubmitComment}
                  className="flex gap-2 px-4 py-2.5 border-t"
                  style={{ borderColor: "var(--border)" }}
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
              )}
            </div>
          )}
        </div>

        {/* Stamp button */}
        <StampPicker
          entryId={entryId}
          currentStamp={initialMyStamp}
          isOwnEntry={isOwnEntry}
          isLoggedIn={isLoggedIn}
          isPlus={isPlus}
          compact
          onStampChange={handleStampChange}
        />
      </div>
    </div>
  );
}
