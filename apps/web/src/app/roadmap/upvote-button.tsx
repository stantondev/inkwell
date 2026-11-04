"use client";

import { useState } from "react";

interface UpvoteButtonProps {
  postId: string;
  initialVoted: boolean;
  initialCount: number;
  isLoggedIn: boolean;
  /** "stack" = arrow over count (item page); "pill" = a small row for cards. */
  variant?: "stack" | "pill";
}

export function UpvoteButton({ postId, initialVoted, initialCount, isLoggedIn, variant = "stack" }: UpvoteButtonProps) {
  const [voted, setVoted] = useState(initialVoted);
  const [count, setCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (!isLoggedIn) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
      return;
    }
    if (loading) return;
    setLoading(true);

    const prevVoted = voted;
    const prevCount = count;

    // Optimistic update
    setVoted(!voted);
    setCount(voted ? count - 1 : count + 1);

    try {
      const res = await fetch(`/api/feedback/${postId}/vote`, { method: "POST" });
      if (res.ok) {
        const { data } = await res.json();
        setVoted(data.voted);
        setCount(data.vote_count);
      } else {
        setVoted(prevVoted);
        setCount(prevCount);
      }
    } catch {
      setVoted(prevVoted);
      setCount(prevCount);
    } finally {
      setLoading(false);
    }
  }

  if (variant === "pill") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center gap-1 rounded-full border px-2.5 text-xs font-semibold tabular-nums transition-colors"
        style={{
          minHeight: 30,
          borderColor: voted ? "var(--accent)" : "var(--border)",
          background: voted ? "var(--accent-light)" : "var(--surface)",
          color: voted ? "var(--accent)" : "var(--muted)",
          cursor: loading ? "wait" : "pointer",
        }}
        aria-pressed={voted}
        aria-label={voted ? `Remove your vote (${count} votes)` : `Vote for this (${count} votes)`}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill={voted ? "currentColor" : "none"}
          stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 5l7 7H5l7-7z" />
        </svg>
        {count}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl border text-sm font-medium transition-colors flex-shrink-0"
      style={{
        borderColor: voted ? "var(--accent)" : "var(--border)",
        background: voted ? "var(--accent-light)" : "transparent",
        color: voted ? "var(--accent)" : "var(--muted)",
        cursor: loading ? "wait" : "pointer",
        minWidth: 48,
      }}
      aria-label={voted ? "Remove upvote" : "Upvote"}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill={voted ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 5l7 7H5l7-7z" />
      </svg>
      <span>{count}</span>
    </button>
  );
}
