// LiveJournal's "Current mood: / Current music: / Current location:" rows.
// Used under the byline on entry pages and inside Classic-view feed entries.
// No hooks, so it renders on the server too.

import { MoodIcon } from "@/components/mood-icon";

export function CurrentBlock({
  mood,
  moodKey,
  moodTheme,
  music,
  location,
  className = "",
}: {
  mood?: string | null;
  moodKey?: string | null;
  moodTheme?: string | null;
  /** Already resolved for display (a player's track name, or the words typed). */
  music?: string | null;
  location?: string | null;
  className?: string;
}) {
  if (!mood && !music && !location) return null;
  return (
    <dl className={`entry-current ${className}`.trim()}>
      {mood && (
        <>
          <dt className="entry-current-label">Current mood:</dt>
          <dd className="entry-current-value">
            <MoodIcon moodKey={moodKey} mood={mood} theme={moodTheme} size={22} />
            <span>{mood}</span>
          </dd>
        </>
      )}
      {music && (
        <>
          <dt className="entry-current-label">Current music:</dt>
          <dd className="entry-current-value">
            <span aria-hidden="true">♪</span>
            <span>{music}</span>
          </dd>
        </>
      )}
      {location && (
        <>
          <dt className="entry-current-label">Current location:</dt>
          <dd className="entry-current-value">{location}</dd>
        </>
      )}
    </dl>
  );
}
