// The cover of Explore's book (default view only): writers to meet, the
// month's most-inked entries and popular tags. On a computer it's the left
// page of the first spread and the entries start on the facing page; on a
// phone it's the first page, with "Start reading" to turn to the first entry;
// in Classic view it's a box above the list.

import Link from "next/link";
import { SuggestedWriters, type SuggestedWriter } from "@/components/suggested-writers";
import type { JournalEntry } from "@/components/journal-entry-card";
import { LocalDate } from "@/components/local-date";
import { CoverStartButton } from "@/components/cover-start-button";
import { decodeEntities } from "@/lib/decode-entities";

export interface PopularTag {
  tag: string;
  writers: number;
  entries: number;
}

export function ExploreCover({
  writers,
  mostInked,
  tags,
  signedIn,
}: {
  writers: SuggestedWriter[];
  mostInked: JournalEntry[];
  tags: PopularTag[];
  signedIn: boolean;
}) {
  if (writers.length === 0 && mostInked.length === 0 && tags.length === 0) return null;
  return (
    <section className="explore-cover" aria-labelledby="explore-cover-title">
      <header className="explore-cover-head">
        <p className="explore-cover-kicker">
          <LocalDate iso={new Date().toISOString()} options={{ month: "long", year: "numeric" }} />
        </p>
        <h2 id="explore-cover-title" className="explore-cover-title">This month on Inkwell</h2>
      </header>

      {writers.length > 0 && (
        <div className="explore-cover-part">
          <h3 className="explore-cover-heading">Writers to meet</h3>
          <SuggestedWriters initial={writers} limit={5} layout="rows" signedIn={signedIn} />
        </div>
      )}

      {mostInked.length > 0 && (
        <div className="explore-cover-part">
          <h3 className="explore-cover-heading">
            Most inked
            <a href="/explore?sort=most_inked" className="explore-cover-more">All-time →</a>
          </h3>
          <ol className="cover-inked">
            {mostInked.slice(0, 5).map((e, i) => (
              <li key={e.id}>
                <Link href={`/${e.author.username}/${e.slug}`} className="cover-inked-item">
                  <span className="cover-inked-rank" aria-hidden="true">{i + 1}</span>
                  <span className="cover-inked-body">
                    <span className="cover-inked-title">{e.title ? decodeEntities(e.title) : "Untitled"}</span>
                    <span className="cover-inked-meta">
                      {e.author.display_name || e.author.username}
                      {" · "}
                      <span className="cover-inked-inks">
                        <svg width="8" height="10" viewBox="0 0 16 20" fill="currentColor" aria-hidden="true">
                          <path d="M8 1C8 1 1 8.5 1 12.5a7 7 0 0 0 14 0C15 8.5 8 1 8 1Z" />
                        </svg>
                        {e.ink_count} {e.ink_count === 1 ? "ink" : "inks"}
                      </span>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      )}

      {tags.length > 0 && (
        <div className="explore-cover-part">
          <h3 className="explore-cover-heading">Popular tags</h3>
          <ul className="cover-tags">
            {tags.map((t) => (
              <li key={t.tag}>
                <a
                  href={`/tag/${encodeURIComponent(t.tag)}`}
                  className="cover-tag"
                  title={`${t.writers} ${t.writers === 1 ? "writer" : "writers"}, ${t.entries} ${t.entries === 1 ? "entry" : "entries"}`}
                >
                  #{t.tag}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <CoverStartButton />
    </section>
  );
}
