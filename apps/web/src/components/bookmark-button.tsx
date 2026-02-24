"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface BookmarkButtonProps {
  entryId: string;
  initialBookmarked: boolean;
  isLoggedIn: boolean;
  /** Override API path for remote or special entries */
  bookmarkApiPath?: string;
  onBookmarkChange?: (bookmarked: boolean) => void;
  /** Icon size in px (default 15) */
  size?: number;
}

export function BookmarkButton({
  entryId,
  initialBookmarked,
  isLoggedIn,
  bookmarkApiPath,
  onBookmarkChange,
  size = 15,
}: BookmarkButtonProps) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [animating, setAnimating] = useState(false);
  const router = useRouter();

  const apiPath = bookmarkApiPath ?? `/api/entries/${entryId}/bookmark`;

  async function handleToggle() {
    if (!isLoggedIn) {
      router.push("/login");
      return;
    }

    const newState = !bookmarked;
    setBookmarked(newState);
    setAnimating(true);
    setTimeout(() => setAnimating(false), 200);
    onBookmarkChange?.(newState);

    try {
      const res = await fetch(apiPath, {
        method: newState ? "POST" : "DELETE",
        cache: "no-store",
      });
      if (!res.ok) {
        // Revert on error
        setBookmarked(!newState);
        onBookmarkChange?.(!newState);
      }
    } catch {
      setBookmarked(!newState);
      onBookmarkChange?.(!newState);
    }
  }

  return (
    <button
      onClick={handleToggle}
      title={bookmarked ? "Remove from reading list" : "Save to reading list"}
      aria-label={bookmarked ? "Remove from reading list" : "Save to reading list"}
      className="flex items-center justify-center transition-colors"
      style={{
        color: bookmarked ? "var(--accent)" : "var(--muted)",
        transform: animating ? "scale(1.25)" : "scale(1)",
        transition: "transform 0.15s ease, color 0.15s ease",
      }}
    >
      {/* Classic ribbon bookmark shape */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={bookmarked ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      </svg>
    </button>
  );
}
