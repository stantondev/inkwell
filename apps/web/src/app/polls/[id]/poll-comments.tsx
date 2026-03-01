"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { PollCommentForm } from "./poll-comment-form";

interface CommentUser {
  id: string | null;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

interface PollComment {
  id: string;
  body: string;
  user: CommentUser;
  inserted_at: string;
}

interface PollCommentsProps {
  pollId: string;
  isLoggedIn: boolean;
  currentUserId?: string | null;
  isAdmin?: boolean;
  initialCommentCount: number;
}

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(isoString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function PollComments({
  pollId,
  isLoggedIn,
  currentUserId,
  isAdmin,
  initialCommentCount,
}: PollCommentsProps) {
  const [comments, setComments] = useState<PollComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/polls/${pollId}/comments`);
      if (res.ok) {
        const data = await res.json();
        setComments(data.data || []);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [pollId]);

  // Auto-expand and fetch if there are comments
  useEffect(() => {
    if (initialCommentCount > 0 || expanded) {
      setExpanded(true);
      fetchComments();
    }
  }, [initialCommentCount, expanded, fetchComments]);

  // Re-fetch when router refreshes (after posting a comment)
  useEffect(() => {
    if (expanded) {
      fetchComments();
    }
  }, [expanded, fetchComments]);

  async function handleDelete(commentId: string) {
    try {
      const res = await fetch(`/api/polls/comments/${commentId}`, {
        method: "DELETE",
      });
      if (res.ok || res.status === 204) {
        setComments((prev) => prev.filter((c) => c.id !== commentId));
      }
    } catch {
      // silently fail
    }
  }

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="text-sm transition-colors"
        style={{ color: "var(--muted)" }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted)")}
      >
        <CommentIcon /> Comments{initialCommentCount > 0 ? ` (${initialCommentCount})` : ""}
      </button>
    );
  }

  return (
    <div className="space-y-4">
      <h3
        className="text-sm font-medium"
        style={{ color: "var(--foreground)" }}
      >
        Comments {comments.length > 0 ? `(${comments.length})` : ""}
      </h3>

      {loading ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Loading comments...
        </p>
      ) : (
        <>
          {comments.length === 0 && (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              No comments yet. Be the first to share your thoughts!
            </p>
          )}

          <div className="space-y-3">
            {comments.map((comment) => (
              <div
                key={comment.id}
                className="rounded-lg border p-3"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--surface)",
                }}
              >
                <div className="flex items-start gap-2.5">
                  <Link href={comment.user.id ? `/${comment.user.username}` : "#"}>
                    <Avatar
                      url={comment.user.avatar_url}
                      name={comment.user.display_name}
                      size={28}
                    />
                  </Link>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={comment.user.id ? `/${comment.user.username}` : "#"}
                        className="text-sm font-medium hover:underline"
                        style={{ color: "var(--foreground)" }}
                      >
                        {comment.user.display_name}
                      </Link>
                      <span className="text-xs" style={{ color: "var(--muted)" }}>
                        {timeAgo(comment.inserted_at)}
                      </span>
                    </div>
                    <div
                      className="text-sm mt-1 poll-comment-body"
                      style={{ color: "var(--foreground)" }}
                      dangerouslySetInnerHTML={{ __html: comment.body }}
                    />
                    {(comment.user.id === currentUserId || isAdmin) && (
                      <button
                        onClick={() => handleDelete(comment.id)}
                        className="text-xs mt-1 transition-colors"
                        style={{ color: "var(--muted)" }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.color = "#B91C1C")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.color = "var(--muted)")
                        }
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {isLoggedIn ? (
        <PollCommentForm pollId={pollId} />
      ) : (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          <Link
            href="/login"
            style={{ color: "var(--accent)", textDecoration: "underline" }}
          >
            Sign in
          </Link>{" "}
          to leave a comment.
        </p>
      )}
    </div>
  );
}

function CommentIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "inline", verticalAlign: "-2px", marginRight: "4px" }}
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
