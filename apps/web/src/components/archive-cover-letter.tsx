"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArchivePostmark } from "./archive-postmark";
import { ARCHIVE_ASIDE_KEY, archiveOriginName, postmarkDate } from "@/lib/archive";

/**
 * A cover letter clipped to the top of a post brought over from another
 * journal: when it was first written, where, and (if the writer left one) a
 * note in their own words. "Set it aside" peels it off; once a reader has
 * set one aside, the rest are folded for the rest of their visit, leaving a
 * small tab that reopens them.
 */
export function ArchiveCoverLetter({
  entryId,
  origin,
  publishedAt,
  originalUrl,
  note,
  authorName,
  isOwnEntry,
}: {
  entryId: string;
  origin: string | null;
  publishedAt: string;
  originalUrl: string | null;
  note: string | null;
  authorName: string;
  isOwnEntry: boolean;
}) {
  const [state, setState] = useState<"open" | "peeling" | "aside">("open");
  const name = archiveOriginName(origin);
  const date = postmarkDate(publishedAt);
  const yearsAgo = date ? new Date().getUTCFullYear() - date.year : 0;

  useEffect(() => {
    try {
      if (sessionStorage.getItem(ARCHIVE_ASIDE_KEY) === "1") setState("aside");
    } catch {
      /* storage unavailable: the letter just stays open */
    }
  }, []);

  const setAside = () => {
    try {
      sessionStorage.setItem(ARCHIVE_ASIDE_KEY, "1");
    } catch {
      /* ignore */
    }
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setState("aside");
    } else {
      setState("peeling");
      window.setTimeout(() => setState("aside"), 700);
    }
  };

  if (state === "aside") {
    return (
      <button type="button" className="archive-letter-tab" onClick={() => setState("open")}>
        <ArchivePostmark origin={origin} publishedAt={publishedAt} uid={`${entryId}-tab`} width={34} waves={false} title="" />
        <span>
          <strong>From the {name} archive</strong>
          {date && <> &middot; {date.year}</>}
          <span className="archive-letter-tab-open">Read the cover letter</span>
        </span>
      </button>
    );
  }

  return (
    <aside className={`archive-letter${state === "peeling" ? " is-peeling" : ""}`} aria-label={`From the ${name} archive`}>
      <svg className="archive-letter-clip" width="22" height="58" viewBox="0 0 22 58" aria-hidden="true">
        <path
          d="M7 18 V46 a4 4 0 0 0 8 0 V10 a6 6 0 0 0 -12 0 V48 a8 8 0 0 0 16 0 V16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>

      <ArchivePostmark
        origin={origin}
        publishedAt={publishedAt}
        uid={entryId}
        width={170}
        className="archive-letter-postmark"
      />

      <p className="archive-letter-kicker">From the {name} archive</p>

      {note ? (
        <>
          <p className="archive-letter-note">{note}</p>
          <p className="archive-letter-signature">&mdash; {authorName}</p>
        </>
      ) : null}

      <p className={note ? "archive-letter-fact" : "archive-letter-fact archive-letter-fact--lead"}>
        {date ? (
          <>
            First written on {date.long}
            {yearsAgo > 0 && (
              <span suppressHydrationWarning>
                , {yearsAgo} {yearsAgo === 1 ? "year" : "years"} ago
              </span>
            )}
            . Brought over from {name} and left as it was.
          </>
        ) : (
          <>Brought over from {name} and left as it was.</>
        )}
      </p>

      {isOwnEntry && !note && (
        <p className="archive-letter-hint">
          Only you see this: you can add a note of your own in{" "}
          <Link href="/settings/import#archive">Settings &rarr; Import</Link>.
        </p>
      )}

      <div className="archive-letter-actions">
        {originalUrl ? (
          <a href={originalUrl} target="_blank" rel="noopener noreferrer nofollow ugc">
            See it on {name} &#8599;
          </a>
        ) : (
          <span />
        )}
        <button type="button" onClick={setAside} className="archive-letter-aside">
          Set it aside &rarr;
        </button>
      </div>
    </aside>
  );
}
