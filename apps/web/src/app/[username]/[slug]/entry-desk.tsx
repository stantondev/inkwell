// Under the entry page: the things a reader can send back, side by side
// (ink, a stamp, a footnote, a reprint), and for a public entry how to
// answer it from Mastodon. Labelled tools in the muted colour, no prompts:
// see "Pulled back 2026-09-28" in CLAUDE.md.
import { InkButton } from "@/components/ink-button";
import { ReprintButton } from "@/components/reprint-button";
import { StampPicker } from "@/components/stamp-picker";
import type { StampMark } from "@/components/stamp-config";
import { FediverseHandle } from "../fediverse-handle";

export function EntryDesk({
  entryId,
  username,
  writerName,
  isOwnEntry,
  isLoggedIn,
  isPlus,
  isPublic,
  footnoteCount,
  inked,
  inkCount,
  reprinted,
  reprintCount,
  myStamp,
  myNote,
  myStampedOn,
  stampMarks,
}: {
  entryId: string;
  username: string;
  writerName: string;
  isOwnEntry: boolean;
  isLoggedIn: boolean;
  isPlus: boolean;
  isPublic: boolean;
  footnoteCount: number;
  inked: boolean;
  inkCount: number;
  reprinted: boolean;
  reprintCount: number;
  myStamp: string | null;
  myNote?: string | null;
  myStampedOn?: string | null;
  stampMarks?: StampMark[] | null;
}) {
  const footnoteLabel =
    footnoteCount === 0 ? "Footnotes" : footnoteCount === 1 ? "1 footnote" : `${footnoteCount} footnotes`;

  return (
    <section className="entry-desk" aria-label="Ink, stamps, footnotes and reprints">
      <div className="entry-desk-tools">
        <span className="entry-desk-tool">
          <InkButton
            entryId={entryId}
            initialInked={inked}
            initialCount={inkCount}
            isOwnEntry={isOwnEntry}
            isLoggedIn={isLoggedIn}
            size={16}
            label="Ink"
          />
        </span>
        {!isOwnEntry && (
          <span className="entry-desk-tool entry-desk-tool--stamp">
            <StampPicker
              entryId={entryId}
              currentStamp={myStamp}
              currentNote={myNote}
              currentStampedOn={myStampedOn}
              currentMarks={stampMarks}
              writerName={writerName}
              isOwnEntry={isOwnEntry}
              isLoggedIn={isLoggedIn}
              isPlus={isPlus}
              popupAlign="start"
            />
          </span>
        )}
        <a href="#comments" className="entry-desk-tool entry-desk-link">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
          <span>{footnoteLabel}</span>
        </a>
        <span className="entry-desk-tool">
          <ReprintButton
            entryId={entryId}
            initialReprinted={reprinted}
            initialCount={reprintCount}
            isOwnEntry={isOwnEntry}
            isLoggedIn={isLoggedIn}
            isRemote={false}
            size={16}
            label="Reprint"
          />
        </span>
      </div>

      {isPublic && (
        <p className="entry-desk-fedi">
          {isOwnEntry ? (
            <>Readers on Mastodon and elsewhere see your entries from </>
          ) : (
            <>On Mastodon or another fediverse app? Search for this page&rsquo;s link there to reply, or follow </>
          )}
          <FediverseHandle username={username} mutedColor="var(--muted)" accentColor="var(--accent)" />
        </p>
      )}
    </section>
  );
}
