// One reading speed for the whole site. Before this, the editor used 230
// words a minute, the entry page 200, quoted posts 265 and emails 250, so the
// same entry showed different reading times in different places.
export const WORDS_PER_MINUTE = 230;

/** Whole minutes to read `wordCount` words, never less than 1. */
export function readingMinutes(wordCount: number | null | undefined): number {
  return Math.max(1, Math.round((wordCount ?? 0) / WORDS_PER_MINUTE));
}

/** "4 min read" */
export function readingTimeLabel(wordCount: number | null | undefined): string {
  return `${readingMinutes(wordCount)} min read`;
}
