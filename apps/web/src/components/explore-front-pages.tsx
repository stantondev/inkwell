// Explore's front pages: the first two pages of the book on the default view
// ("Writers to meet" on the left, "Most inked this month" on the right), so the
// discovery sections cost no height above the book. On phones they're the
// first two pages you swipe through; in Classic view, two boxes above the list.

import Link from "next/link";
import type { ReactNode } from "react";
import { SuggestedWriters, type SuggestedWriter } from "@/components/suggested-writers";
import type { JournalEntry } from "@/components/journal-entry-card";
import { decodeEntities } from "@/lib/decode-entities";

function FrontPage({ kicker, title, dek, children }: { kicker: string; title: string; dek: string; children: ReactNode }) {
  return (
    <section className="front-page">
      <p className="front-page-kicker">{kicker}</p>
      <h2 className="front-page-title">{title}</h2>
      <p className="front-page-dek">{dek}</p>
      {children}
    </section>
  );
}

export function WritersToMeetPage({ writers, signedIn }: { writers: SuggestedWriter[]; signedIn: boolean }) {
  return (
    <FrontPage
      kicker="On Inkwell"
      title="Writers to meet"
      dek={signedIn
        ? "People writing here lately. Follow one and their public entries come to your Feed."
        : "People writing here lately. Follow one to read them in your own Feed."}
    >
      <SuggestedWriters initial={writers} limit={8} layout="list" signedIn={signedIn} />
    </FrontPage>
  );
}

export function MostInkedPage({ entries }: { entries: JournalEntry[] }) {
  return (
    <FrontPage
      kicker="This month"
      title="Most inked"
      dek="Readers ink an entry to say more people should read it. These got the most in the last 30 days."
    >
      <ol className="front-inked">
        {entries.map((e, i) => {
          const minutes = e.word_count ? Math.max(1, Math.round(e.word_count / 250)) : null;
          return (
            <li key={e.id}>
              <Link href={`/${e.author.username}/${e.slug}`} className="front-inked-item">
                <span className="front-inked-rank" aria-hidden="true">{i + 1}</span>
                <span className="front-inked-body">
                  <span className="front-inked-title">{e.title ? decodeEntities(e.title) : "Untitled"}</span>
                  {e.excerpt && <span className="front-inked-excerpt">{decodeEntities(e.excerpt)}</span>}
                  <span className="front-inked-meta">
                    {e.author.display_name || e.author.username}
                    {minutes && <> · {minutes} min read</>}
                    {" · "}
                    <span className="front-inked-inks">
                      <svg width="9" height="11" viewBox="0 0 16 20" fill="currentColor" aria-hidden="true">
                        <path d="M8 1C8 1 1 8.5 1 12.5a7 7 0 0 0 14 0C15 8.5 8 1 8 1Z" />
                      </svg>
                      {e.ink_count} {e.ink_count === 1 ? "ink" : "inks"}
                    </span>
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </FrontPage>
  );
}
