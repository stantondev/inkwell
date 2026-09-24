"use client";

import Link from "next/link";
import { useState } from "react";
import { AvatarWithFrame } from "@/components/avatar-with-frame";
import { threadHref, timeAgo, type CircleEntry } from "../circle-types";

interface Props {
  entry: CircleEntry;
  circleId: string;
  circleSlug: string;
  canModerate: boolean;
  currentUserId: string | null;
  pinned?: boolean;
  onChanged: () => void;
}

/** One thread in a circle's list: the post that started it and how much it's been answered. */
export default function ThreadRow({ entry, circleId, circleSlug, canModerate, currentUserId, pinned, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const author = entry.author;
  const href = threadHref(circleSlug, entry.id);
  const isMine = !!currentUserId && author?.id === currentUserId;
  const answers = entry.answer_count ?? 0;
  const comments = entry.comment_count ?? 0;

  const act = async (url: string, init: RequestInit, confirmText: string) => {
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "That didn't work. Try again.");
      } else {
        onChanged();
      }
    } catch {
      setError("That didn't work. Try again.");
    }
    setBusy(false);
  };

  return (
    <article className={`circle-thread${pinned ? " circle-thread--pinned" : ""}`}>
      <div className="circle-thread-count" aria-label={`${answers} answer${answers === 1 ? "" : "s"}`}>
        <strong>{answers}</strong>
        <span>{answers === 1 ? "answer" : "answers"}</span>
      </div>

      <div className="circle-thread-main">
        <div className="circle-thread-tags">
          {pinned && <span className="circle-entry-tag circle-entry-tag--prompt">Pinned prompt</span>}
          {entry.privacy === "circle" && (
            <span className="circle-entry-tag" title="Only members of this circle can read it">
              Members only
            </span>
          )}
        </div>
        <Link href={href} className="circle-thread-title">
          {entry.title || entry.excerpt?.slice(0, 80) || "Untitled"}
        </Link>
        {entry.excerpt && entry.title && <p className="circle-thread-excerpt">{entry.excerpt}</p>}
        <div className="circle-thread-meta">
          {author && (
            <Link href={`/${author.username}`} className="circle-thread-author">
              <AvatarWithFrame url={author.avatar_url} name={author.display_name || author.username} size={20} />
              {author.display_name || author.username}
            </Link>
          )}
          <span suppressHydrationWarning>
            {answers > 0 ? "active " : "posted "}
            {timeAgo(entry.last_activity_at || entry.published_at)}
          </span>
          {comments > 0 && (
            <span>
              {comments} comment{comments === 1 ? "" : "s"}
            </span>
          )}

          {(canModerate || isMine) && (
            <span className="circle-entry-actions">
              {canModerate && !pinned && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    act(
                      `/api/circles/${circleId}/prompt`,
                      { method: "POST", body: JSON.stringify({ entry_id: entry.id }) },
                      "Pin this as the circle's prompt? Members will be told about it.",
                    )
                  }
                >
                  Pin as prompt
                </button>
              )}
              {canModerate && pinned && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act(`/api/circles/${circleId}/prompt`, { method: "DELETE" }, "Unpin this prompt? The thread stays.")}
                >
                  Unpin
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  act(
                    `/api/circles/${circleId}/entries/${entry.id}`,
                    { method: "DELETE" },
                    isMine
                      ? "Take this out of the circle? It stays on your journal."
                      : "Take this out of the circle? It stays on the writer's journal.",
                  )
                }
              >
                Take out of circle
              </button>
            </span>
          )}
        </div>
        {error && <p className="circle-entry-error">{error}</p>}
      </div>
    </article>
  );
}
