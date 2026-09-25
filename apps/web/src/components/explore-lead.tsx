// The small block at the top of Explore's first page (default view only):
// four writers to meet and the month's three most-inked entries. It sits above
// the entries on the same page, so the writing is visible straight away; it
// used to be two whole pages, which hid the entries on the next spread.

import Link from "next/link";
import { SuggestedWriters, type SuggestedWriter } from "@/components/suggested-writers";
import type { JournalEntry } from "@/components/journal-entry-card";
import { decodeEntities } from "@/lib/decode-entities";

export function ExploreLead({
  writers,
  mostInked,
  signedIn,
}: {
  writers: SuggestedWriter[];
  mostInked: JournalEntry[];
  signedIn: boolean;
}) {
  if (writers.length === 0 && mostInked.length === 0) return null;
  return (
    <section className="explore-lead" aria-label="Discover">
      {writers.length > 0 && (
        <div className="explore-lead-part">
          <h2 className="explore-lead-heading">Writers to meet</h2>
          <SuggestedWriters initial={writers} limit={4} layout="chips" signedIn={signedIn} />
        </div>
      )}
      {mostInked.length > 0 && (
        <div className="explore-lead-part">
          <h2 className="explore-lead-heading">
            Most inked this month
            <a href="/explore?sort=most_inked" className="explore-lead-more">All-time →</a>
          </h2>
          <ol className="lead-inked">
            {mostInked.slice(0, 3).map((e, i) => (
              <li key={e.id}>
                <Link href={`/${e.author.username}/${e.slug}`} className="lead-inked-item">
                  <span className="lead-inked-rank" aria-hidden="true">{i + 1}</span>
                  <span className="lead-inked-body">
                    <span className="lead-inked-title">{e.title ? decodeEntities(e.title) : "Untitled"}</span>
                    <span className="lead-inked-meta">
                      {e.author.display_name || e.author.username}
                      {" · "}
                      <span className="lead-inked-inks">
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
    </section>
  );
}
