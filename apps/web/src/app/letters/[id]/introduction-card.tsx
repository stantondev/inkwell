import Link from "next/link";
import { LocalDate, FULL_DATE } from "@/components/local-date";
import { hand } from "@/app/stamp-album/fonts";
import { decodeEntities } from "@/lib/decode-entities";
import type { ThreadIntroduction } from "@/lib/pen-pal-exchange";

/**
 * The letter of introduction at the top of a thread between two people the
 * pen pal exchange brought together: who they are in their own words, and
 * something of theirs to read before writing.
 */
export function IntroductionCard({
  introduction,
  otherName,
  otherUsername,
  empty,
}: {
  introduction: ThreadIntroduction;
  otherName: string;
  otherUsername: string;
  /** Nothing has been written yet. */
  empty: boolean;
}) {
  const entry = introduction.their_latest_entry;
  const entryTitle = entry ? decodeEntities(entry.title || entry.excerpt || "their latest entry") : null;
  const since = introduction.their_member_since
    ? new Date(introduction.their_member_since).getUTCFullYear()
    : null;

  return (
    <aside className={`intro-letter ${hand.variable}`} aria-label="How you two met">
      <div className="intro-letter-seal" aria-hidden="true">
        <svg viewBox="0 0 48 48" width="48" height="48">
          <path
            className="intro-letter-wax"
            d="M24 3c4 0 5 3 9 4s7-1 9 3-1 6 0 10 4 5 3 9-5 4-7 8-1 7-5 8-6-2-9-2-6 3-10 1-3-6-6-9-6-4-6-8 3-6 3-10-2-7 1-10 6-1 10-2 4-2 8-2Z"
          />
          <path
            className="intro-letter-nib"
            d="M24 13c3 4 6 8 6 12a6 6 0 0 1-12 0c0-4 3-8 6-12Zm0 9v7"
            fill="none"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <p className="intro-letter-kicker">A letter of introduction</p>
      <p className="intro-letter-lead">
        Inkwell introduced you and{" "}
        <Link href={`/${otherUsername}`} className="intro-letter-name">
          {otherName}
        </Link>{" "}
        on <LocalDate iso={introduction.introduced_at} options={FULL_DATE} />. You both asked for a pen pal.
      </p>

      <dl className="intro-letter-facts">
        {introduction.their_note && (
          <div>
            <dt>{otherName}, in their own words</dt>
            <dd className="intro-letter-quote">“{introduction.their_note}”</dd>
          </div>
        )}
        {introduction.my_note && (
          <div>
            <dt>What they were told about you</dt>
            <dd className="intro-letter-quote">“{introduction.my_note}”</dd>
          </div>
        )}
        {entry && entryTitle && (
          <div>
            <dt>Something of theirs to read</dt>
            <dd>
              <Link href={entry.path} className="intro-letter-entry">
                {entryTitle}
              </Link>
            </dd>
          </div>
        )}
        {since && (
          <div>
            <dt>On Inkwell since</dt>
            <dd>{since}</dd>
          </div>
        )}
      </dl>

      {empty && (
        <p className="intro-letter-close">
          Either of you can write first. Say hello, mention what you noticed in their writing, ask a question. There
          is no deadline.
        </p>
      )}
      <p className="intro-letter-sign">Inkwell</p>
    </aside>
  );
}
