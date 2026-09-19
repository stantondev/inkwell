/**
 * Ids of drafts this browser tab's editor created itself. When autosave first
 * creates a draft it writes `?edit=<id>` into the URL; that must not count as
 * "the writer opened a different entry" (see EditorRoute).
 */
export const draftsCreatedHere = new Set<string>();
