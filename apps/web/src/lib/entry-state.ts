"use client";

import { useEffect, useRef } from "react";

/**
 * One channel for "this entry's ink/bookmark state changed", so every place
 * that shows it agrees: the Ink and Bookmark buttons, the feed's own copy of
 * the entry, and the mobile double-tap gesture.
 *
 * Before this, InkButton and BookmarkButton copied their props into state once
 * and never looked again. Inking by gesture updated the feed but left the
 * button showing the old state, and the next tap on the button toggled from
 * that stale state.
 */
export const ENTRY_STATE_EVENT = "inkwell-entry-state";

export interface EntryStatePatch {
  my_ink?: boolean;
  ink_count?: number;
  bookmarked?: boolean;
}

interface EntryStateDetail {
  id: string;
  patch: EntryStatePatch;
  /** Which component sent it, so a listener can skip its own echo. */
  source?: unknown;
}

export function emitEntryState(id: string, patch: EntryStatePatch, source?: unknown) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<EntryStateDetail>(ENTRY_STATE_EVENT, { detail: { id, patch, source } }));
}

/** Run `onChange` whenever another component reports a change to entry `id` (or any entry, when `id` is null). */
export function useEntryState(
  id: string | null,
  onChange: (patch: EntryStatePatch, entryId: string) => void,
  self?: unknown,
) {
  const handler = useRef(onChange);
  handler.current = onChange;

  useEffect(() => {
    function listen(e: Event) {
      const { id: changed, patch, source } = (e as CustomEvent<EntryStateDetail>).detail;
      if (id !== null && changed !== id) return;
      if (self !== undefined && source === self) return;
      handler.current(patch, changed);
    }
    window.addEventListener(ENTRY_STATE_EVENT, listen);
    return () => window.removeEventListener(ENTRY_STATE_EVENT, listen);
  }, [id, self]);
}
