"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AvatarWithFrame } from "@/components/avatar-with-frame";
import { LocalDate, SHORT_DATE } from "@/components/local-date";
import type { CircleEntry } from "../../../circle-types";

/** The entries answering a thread, oldest first, each readable in place. */
export default function ThreadAnswers({
  answers,
  total,
  highlightId,
}: {
  answers: CircleEntry[];
  total: number;
  highlightId: string | null;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  // Coming back from the editor: bring the new answer into view.
  useEffect(() => {
    if (!highlightId) return;
    document.getElementById(`answer-${highlightId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId]);

  return (
    <section style={{ marginTop: "2rem" }}>
      <h2 className="circle-section-heading">
        {total === 0 ? "No answers yet" : `${total} answer${total === 1 ? "" : "s"}`}
      </h2>
      {total === 0 && <p className="circle-empty">Be the first to write one.</p>}

      {answers.map((a) => {
        const author = a.author;
        const href = author ? `/${author.username}/${a.slug}` : "#";
        const expanded = !!open[a.id];
        // Only long answers are shortened (and get "Read it all").
        const long = (a.word_count ?? 0) > 120;
        return (
          <article
            key={a.id}
            id={`answer-${a.id}`}
            className={`circle-answer${a.id === highlightId ? " circle-answer--new" : ""}`}
          >
            {a.id === highlightId && <p className="circle-answer-posted">Your answer is posted.</p>}
            <div className="circle-thread-meta">
              {author && (
                <Link href={`/${author.username}`} className="circle-thread-author">
                  <AvatarWithFrame
                    url={author.avatar_url}
                    name={author.display_name || author.username}
                    size={24}
                    frame={author.avatar_frame}
                    subscriptionTier={author.subscription_tier}
                  />
                  {author.display_name || author.username}
                </Link>
              )}
              <LocalDate iso={a.published_at} options={SHORT_DATE} />
              {a.privacy === "circle" && <span className="circle-entry-tag">Members only</span>}
            </div>
            {a.title && (
              <Link href={href} className="circle-answer-title">
                {a.title}
              </Link>
            )}
            <div
              className={`prose-entry circle-answer-body${long && !expanded ? " circle-answer-body--clamped" : ""}`}
              dangerouslySetInnerHTML={{ __html: a.body_html || "" }}
            />
            <div className="circle-thread-meta">
              {long && (
                <button type="button" className="circle-link-btn" onClick={() => setOpen((o) => ({ ...o, [a.id]: !expanded }))}>
                  {expanded ? "Show less" : "Read it all"}
                </button>
              )}
              <Link href={`${href}#comments`}>
                {a.comment_count ? `${a.comment_count} comment${a.comment_count === 1 ? "" : "s"}` : "Comment"}
              </Link>
              <Link href={href}>Open entry</Link>
            </div>
          </article>
        );
      })}
    </section>
  );
}
