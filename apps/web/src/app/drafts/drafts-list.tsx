"use client";

import { useState } from "react";
import Link from "next/link";

interface DraftEntry {
  id: string;
  title: string | null;
  body_html: string | null;
  mood: string | null;
  tags: string[];
  privacy: string;
  updated_at: string;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function DraftsList({ initialDrafts }: { initialDrafts: DraftEntry[] }) {
  const [drafts, setDrafts] = useState(initialDrafts);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/entries/${id}`, { method: "DELETE" });
      if (res.ok || res.status === 204) {
        setDrafts((prev) => prev.filter((d) => d.id !== id));
      }
    } catch {
      // silently fail
    } finally {
      setDeletingId(null);
      setConfirmingId(null);
    }
  }

  if (drafts.length === 0) {
    return (
      <div
        className="rounded-2xl border p-12 text-center"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <p style={{ color: "var(--muted)" }}>
          No drafts yet. Start writing and save as draft to see them here.
        </p>
        <Link
          href="/editor"
          className="inline-block mt-4 text-sm font-medium underline"
          style={{ color: "var(--accent)" }}
        >
          Start writing
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {drafts.map((draft) => {
        const preview = draft.title
          ? draft.title
          : draft.body_html
            ? stripHtml(draft.body_html).slice(0, 80) || "Untitled draft"
            : "Untitled draft";
        const hasTitle = !!draft.title;
        const isConfirming = confirmingId === draft.id;
        const isDeleting = deletingId === draft.id;

        return (
          <div
            key={draft.id}
            className="flex items-start gap-4 py-4 px-4 rounded-xl -mx-4 border-b"
            style={{ borderColor: "var(--border)" }}
          >
            <Link
              href={`/editor?edit=${draft.id}`}
              className="flex-1 min-w-0 group"
            >
              <p
                className="font-medium leading-snug group-hover:underline truncate"
                style={{
                  fontFamily: hasTitle ? "var(--font-lora, Georgia, serif)" : undefined,
                  color: hasTitle ? "var(--foreground)" : "var(--muted)",
                  fontStyle: hasTitle ? undefined : "italic",
                }}
              >
                {preview}
              </p>
              <div
                className="flex items-center gap-2 mt-1 text-xs flex-wrap"
                style={{ color: "var(--muted)" }}
              >
                {draft.mood && <span>feeling {draft.mood}</span>}
                {draft.tags.slice(0, 3).map((t) => (
                  <span key={t}>#{t}</span>
                ))}
              </div>
            </Link>

            <div className="flex items-center gap-2 flex-shrink-0 mt-1">
              <time className="text-xs" style={{ color: "var(--muted)" }}>
                {timeAgo(draft.updated_at)}
              </time>

              {isConfirming ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleDelete(draft.id)}
                    disabled={isDeleting}
                    className="text-xs font-medium px-2 py-1 rounded transition-colors"
                    style={{ background: "#ef4444", color: "#fff", opacity: isDeleting ? 0.6 : 1 }}
                  >
                    {isDeleting ? "..." : "Delete"}
                  </button>
                  <button
                    onClick={() => setConfirmingId(null)}
                    className="text-xs font-medium px-2 py-1 rounded transition-colors"
                    style={{ color: "var(--muted)" }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmingId(draft.id)}
                  className="flex items-center justify-center w-7 h-7 rounded-full transition-colors hover:bg-[var(--surface-hover)]"
                  style={{ color: "var(--muted)" }}
                  aria-label="Delete draft"
                  title="Delete draft"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
