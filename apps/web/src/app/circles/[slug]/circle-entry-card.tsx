"use client";

import Link from "next/link";
import { useState } from "react";
import { AvatarWithFrame } from "@/components/avatar-with-frame";
import { LocalDate, SHORT_DATE } from "@/components/local-date";
import type { CircleEntry } from "../circle-types";

interface Props {
  entry: CircleEntry;
  circleId: string;
  canModerate: boolean;
  currentUserId: string | null;
  onChanged: () => void;
}

/** One entry posted to a circle, as it appears on the circle page. */
export default function CircleEntryCard({ entry, circleId, canModerate, currentUserId, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const author = entry.author;
  const href = author ? `/${author.username}/${entry.slug}` : "#";
  const isMine = !!currentUserId && author?.id === currentUserId;
  const readingMinutes = Math.max(1, Math.round((entry.word_count || 0) / 230));

  const act = async (url: string, init: RequestInit, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
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
    <article className="circle-entry">
      <div className="circle-entry-byline">
        {author && (
          <Link href={`/${author.username}`} className="circle-entry-author">
            <AvatarWithFrame
              url={author.avatar_url}
              name={author.display_name || author.username}
              size={28}
              frame={author.avatar_frame}
              subscriptionTier={author.subscription_tier}
            />
            <span>{author.display_name || author.username}</span>
          </Link>
        )}
        <span className="circle-entry-meta">
          <LocalDate iso={entry.published_at} options={SHORT_DATE} />
          {" · "}
          {readingMinutes} min read
        </span>
        {entry.privacy === "circle" && (
          <span className="circle-entry-tag" title="Only members of this circle can read it">
            Members only
          </span>
        )}
        {entry.is_prompt && <span className="circle-entry-tag circle-entry-tag--prompt">Prompt</span>}
      </div>

      <Link href={href} className="circle-entry-body">
        <div style={{ flex: 1, minWidth: 0 }}>
          {entry.title && <h3 className="circle-entry-title">{entry.title}</h3>}
          {entry.excerpt && <p className="circle-entry-excerpt">{entry.excerpt}</p>}
        </div>
        {entry.cover_image_id && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/images/${entry.cover_image_id}`} alt="" className="circle-entry-cover" loading="lazy" />
        )}
      </Link>

      <div className="circle-entry-footer">
        <Link href={`${href}#comments`}>
          {entry.comment_count ? `${entry.comment_count} comment${entry.comment_count === 1 ? "" : "s"}` : "Comment"}
        </Link>
        {entry.ink_count > 0 && <span>{entry.ink_count} ink{entry.ink_count === 1 ? "" : "s"}</span>}
        {entry.is_prompt && typeof entry.response_count === "number" && (
          <span>
            {entry.response_count} answer{entry.response_count === 1 ? "" : "s"}
          </span>
        )}

        {(canModerate || isMine) && (
          <span className="circle-entry-actions">
            {canModerate && !entry.is_prompt && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  act(`/api/circles/${circleId}/prompt`, {
                    method: "POST",
                    body: JSON.stringify({ entry_id: entry.id }),
                  }, "Make this the circle's prompt? Members will be told about it.")
                }
              >
                Make it the prompt
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
    </article>
  );
}
