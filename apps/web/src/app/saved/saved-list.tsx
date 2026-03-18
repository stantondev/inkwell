"use client";

import { useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { BookmarkButton } from "@/components/bookmark-button";

export interface SavedEntry {
  id: string;
  title: string | null;
  body_html: string;
  tags: string[];
  slug: string;
  published_at: string;
  saved_at: string;
  bookmarked: true;
  stamps: string[];
  author: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
}

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

interface SavedEntryCardProps {
  entry: SavedEntry;
  onRemove: (id: string) => void;
}

function SavedEntryCard({ entry, onRemove }: SavedEntryCardProps) {
  const [removing, setRemoving] = useState(false);
  const href = `/${entry.author.username}/${entry.slug}`;
  const excerpt = stripHtml(entry.body_html).slice(0, 220);
  const savedAgo = timeAgo(entry.saved_at);

  function handleBookmarkChange(bookmarked: boolean) {
    if (!bookmarked) {
      setRemoving(true);
      // Fade out then remove from list
      setTimeout(() => onRemove(entry.id), 300);
    }
  }

  return (
    <article
      className="rounded-xl border relative overflow-hidden transition-all duration-300"
      style={{
        borderColor: "var(--border)",
        background: "var(--surface)",
        opacity: removing ? 0 : 1,
        transform: removing ? "translateX(12px)" : "translateX(0)",
      }}
    >
      {/* Ink-blue ribbon stripe on the left edge */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
        style={{ background: "var(--accent)" }}
      />

      <div className="pl-5 pr-4 py-4 sm:pr-5 sm:py-5">
        {/* Top row: author + bookmark toggle */}
        <div className="flex items-center justify-between gap-3 mb-3">
          <Link
            href={`/${entry.author.username}`}
            className="flex items-center gap-2 group min-w-0"
          >
            <Avatar
              url={entry.author.avatar_url}
              name={entry.author.display_name}
              size={22}
            />
            <span
              className="text-xs font-medium truncate group-hover:underline"
              style={{ color: "var(--muted)" }}
            >
              {entry.author.display_name}
            </span>
          </Link>

          <BookmarkButton
            entryId={entry.id}
            initialBookmarked={true}
            isLoggedIn={true}
            onBookmarkChange={handleBookmarkChange}
            size={16}
          />
        </div>

        {/* Title */}
        {entry.title && (
          <Link href={href} className="block hover:underline mb-2">
            <h2
              className="text-base font-semibold leading-snug"
              style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
            >
              {entry.title}
            </h2>
          </Link>
        )}

        {/* Excerpt */}
        {excerpt && (
          <p
            className="text-sm leading-relaxed mb-3 line-clamp-3"
            style={{ color: "var(--muted)" }}
          >
            {excerpt}
            {excerpt.length >= 220 && "…"}
          </p>
        )}

        {/* Footer: tags + saved date + read link */}
        <div className="flex items-center justify-between gap-2 flex-wrap mt-3">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            {/* Saved date */}
            <span
              className="flex items-center gap-1 text-xs"
              style={{ color: "var(--muted)" }}
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="var(--accent)"
                stroke="var(--accent)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
              Saved {savedAgo}
            </span>

            {/* Tags */}
            {entry.tags.slice(0, 3).map((tag) => (
              <Link
                key={tag}
                href={`/tag/${encodeURIComponent(tag)}`}
                className="text-xs px-2 py-0.5 rounded-full border transition-colors hover:border-[var(--accent)]"
                style={{ borderColor: "var(--border)", color: "var(--muted)" }}
              >
                #{tag}
              </Link>
            ))}
          </div>

          <Link
            href={href}
            className="text-xs font-medium shrink-0 hover:underline"
            style={{ color: "var(--accent)" }}
          >
            Read &rarr;
          </Link>
        </div>
      </div>
    </article>
  );
}

interface SavedListProps {
  initialEntries: SavedEntry[];
}

export function SavedList({ initialEntries }: SavedListProps) {
  const [entries, setEntries] = useState(initialEntries);

  function handleRemove(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  if (entries.length === 0) {
    return (
      <div
        className="rounded-2xl border p-12 text-center"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        {/* Decorative ribbon icon */}
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mx-auto mb-4"
          style={{ color: "var(--muted)" }}
        >
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
        <p
          className="text-base font-semibold mb-2"
          style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
        >
          Your reading list is empty
        </p>
        <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
          Save entries from your feed or explore to read later.
        </p>
        <Link
          href="/explore"
          className="inline-block rounded-full px-4 py-2 text-sm font-medium"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          Explore entries
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {entries.map((entry) => (
        <SavedEntryCard key={entry.id} entry={entry} onRemove={handleRemove} />
      ))}
    </div>
  );
}
