"use client";

// Classic view (2004): Feed and Explore as a LiveJournal friends page.
// One column, newest first; each entry is a box with the writer's userpic on
// the left, a header bar with their name and the date, "Subject:", the
// Current block, the post, and "( 3 comments | Leave a comment )".
// Rendered by JournalFeed when the reader has Classic view on; it reuses the
// feed's own loading, translations and action bar.

import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import type { JournalEntry } from "./journal-entry-card";
import { CurrentBlock } from "./current-block";
import { LocalDate } from "./local-date";
import { getMusicLabel } from "@/lib/music";
import { decodeEntities } from "@/lib/decode-entities";

// LJ's cut: long posts show their opening and a "( Read more... )" link.
const CUT_AFTER_WORDS = 350;

const DATE: Intl.DateTimeFormatOptions = { month: "long", day: "numeric", year: "numeric" };
const TIME: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };

function entryHref(entry: JournalEntry) {
  if (entry.source === "remote") return `/fediverse/${entry.id}`;
  return `/${entry.author.username}/${entry.slug ?? entry.id}`;
}

function profileHref(entry: JournalEntry) {
  if (entry.source === "remote") return entry.author.profile_url ?? entry.url ?? "#";
  return `/${entry.author.username}`;
}

function UserHead({ remote }: { remote: boolean }) {
  // LJ's little person icon beside every username; a globe for fediverse writers.
  return remote ? (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" className="classic-userhead" aria-hidden="true">
      <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 16 16" className="classic-userhead" aria-hidden="true">
      <rect x="0.5" y="0.5" width="15" height="15" rx="2" fill="var(--classic-bar)" stroke="var(--border)" />
      <circle cx="8" cy="5.8" r="2.6" fill="var(--accent)" />
      <path d="M3.2 14c.4-3 2.4-4.6 4.8-4.6s4.4 1.6 4.8 4.6" fill="var(--accent)" />
    </svg>
  );
}

function Userpic({ entry }: { entry: JournalEntry }) {
  const name = entry.author.display_name || entry.author.username;
  return (
    <a href={profileHref(entry)} className="classic-userpic" title={name}>
      {entry.userpic || entry.author.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={entry.userpic?.url ?? entry.author.avatar_url!} alt="" width={100} height={100} loading="lazy"
          title={entry.userpic?.keyword} />
      ) : (
        <span className="classic-userpic-blank" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
      )}
    </a>
  );
}

function ClassicEntry({
  entry,
  actions,
  translatedBody,
  isNew = false,
}: {
  entry: JournalEntry;
  actions: ReactNode;
  translatedBody?: string;
  isNew?: boolean;
}) {
  const remote = entry.source === "remote";
  const href = entryHref(entry);
  const handle = remote && entry.author.domain ? `${entry.author.username}@${entry.author.domain}` : entry.author.username;
  const cut = (entry.word_count ?? 0) > CUT_AFTER_WORDS && !!entry.excerpt;
  const comments = entry.comment_count ?? 0;
  const title = entry.title ? decodeEntities(entry.title) : null;

  return (
    <article className="classic-entry">
      <header className="classic-entry-bar">
        <span className="classic-entry-who">
          <UserHead remote={remote} />
          <a href={profileHref(entry)} className="classic-username">{handle}</a>
          {entry.source === "reprint" && entry.reprinter && (
            <span className="classic-reprint">
              {" "}reprinted by <Link href={`/${entry.reprinter.username}`}>{entry.reprinter.username}</Link>
            </span>
          )}
          {entry.circle && (
            <span className="classic-reprint">
              {" "}in <Link href={`/circles/${entry.circle.slug}`}>{entry.circle.name}</Link>
            </span>
          )}
        </span>
        {isNew && <span className="feed-new-tag">New</span>}
        <Link href={href} className="classic-entry-date">
          <LocalDate iso={entry.published_at} options={DATE} /> | <LocalDate iso={entry.published_at} options={TIME} />
        </Link>
      </header>

      <div className="classic-entry-main">
        <Userpic entry={entry} />
        <div className="classic-entry-content">
          {title && (
            <div className="classic-subject">
              <span className="classic-subject-label">Subject:</span>{" "}
              <Link href={href}>{title}</Link>
            </div>
          )}

          <CurrentBlock
            className="classic-current"
            mood={entry.mood}
            moodKey={entry.mood_key}
            moodTheme={entry.mood_theme}
            music={entry.music ? getMusicLabel(entry.music) : null}
            location={entry.location}
          />

          {entry.is_sensitive ? (
            <p className="classic-cw">
              ( Content warning{entry.content_warning ? `: ${entry.content_warning}` : ""} —{" "}
              <Link href={href}>read it on its page</Link> )
            </p>
          ) : cut && !translatedBody ? (
            <div className="classic-body">
              <p>{entry.excerpt}</p>
              <p><Link href={href} className="classic-cut">( Read more… )</Link></p>
            </div>
          ) : (
            <div
              className="classic-body prose-entry"
              dangerouslySetInnerHTML={{ __html: translatedBody ?? entry.body_html }}
            />
          )}

          {entry.quoted_entry && (
            <blockquote className="classic-quote">
              Quoting{" "}
              {entry.quoted_entry.type === "remote" ? (
                <a href={entry.quoted_entry.url ?? "#"}>{entry.quoted_entry.author.username}@{entry.quoted_entry.author.domain}</a>
              ) : (
                <Link href={`/${entry.quoted_entry.author.username}`}>{entry.quoted_entry.author.username}</Link>
              )}
              {entry.quoted_entry.title && <>: <em>{decodeEntities(entry.quoted_entry.title)}</em></>}
            </blockquote>
          )}

          <p className="classic-links">
            ( <Link href={`${href}#comments`}>{comments === 1 ? "1 comment" : `${comments} comments`}</Link>
            {" | "}
            <Link href={`${href}#comments`}>Leave a comment</Link> )
          </p>
          <div className="classic-actions">{actions}</div>
        </div>
      </div>
    </article>
  );
}

export function ClassicFeed({
  entries,
  renderActions,
  translations,
  hasMore,
  loading,
  onLoadMore,
  isNew,
  endNote,
  cover,
}: {
  entries: JournalEntry[];
  renderActions: (entry: JournalEntry) => ReactNode;
  translations: Record<string, { translated_body: string }>;
  hasMore: boolean;
  loading: boolean;
  onLoadMore?: () => void;
  isNew?: (entry: JournalEntry) => boolean;
  endNote?: ReactNode;
  /** Explore's cover (writers, most inked, tags): one box above the entries. */
  cover?: ReactNode;
}) {
  // Feed: a rule after the last entry that's new since the last visit (your
  // own entries are never "new", so this isn't simply the first old one).
  let lastNew = -1;
  if (isNew) entries.forEach((e, i) => { if (isNew(e)) lastNew = i; });
  const firstSeen = lastNew >= 0 && lastNew < entries.length - 1 ? lastNew + 1 : -1;
  return (
    <div className="classic-feed">
      {cover && <div className="classic-cover">{cover}</div>}
      {entries.map((entry, i) => (
        <Fragment key={`${entry.source ?? "local"}-${entry.id}-${entry.reprinted_at ?? ""}`}>
          {i === firstSeen && (
            <p className="feed-caught-up" role="separator">You&apos;re caught up. Earlier entries below.</p>
          )}
          <ClassicEntry
            entry={entry}
            actions={renderActions(entry)}
            translatedBody={translations[entry.id]?.translated_body}
            isNew={isNew?.(entry) ?? false}
          />
        </Fragment>
      ))}
      {hasMore && onLoadMore && (
        <nav className="classic-skip">
          [ <button type="button" onClick={onLoadMore} disabled={loading}>
            {loading ? "Loading…" : "« Earlier entries"}
          </button> ]
        </nav>
      )}
      {endNote && <div className="feed-end-note">{endNote}</div>}
    </div>
  );
}
