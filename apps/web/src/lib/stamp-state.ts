"use client";

import { useEffect, useRef } from "react";
import type { StampMark } from "@/components/stamp-config";

/**
 * One channel for "the stamps on this entry changed", so the stamp cluster in
 * a card's corner, the picker in its action bar and the entry page agree.
 * Same idea as lib/entry-state.ts (ink and bookmarks).
 */
export const STAMP_STATE_EVENT = "inkwell-stamp-state";

export interface StampStatePatch {
  stamps: string[];
  stamp_marks: StampMark[];
  stamp_count: number;
  my_stamp: string | null;
  my_note?: string | null;
  my_stamped_on?: string | null;
  /** The mark that was just pressed, so it can play the press animation. */
  pressed?: string | null;
}

interface Detail {
  id: string;
  patch: StampStatePatch;
}

export function emitStampState(id: string, patch: StampStatePatch) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<Detail>(STAMP_STATE_EVENT, { detail: { id, patch } }));
}

export function useStampState(id: string | null | undefined, onChange: (patch: StampStatePatch) => void) {
  const handler = useRef(onChange);
  handler.current = onChange;
  useEffect(() => {
    if (!id) return;
    function listen(e: Event) {
      const d = (e as CustomEvent<Detail>).detail;
      if (d.id === id) handler.current(d.patch);
    }
    window.addEventListener(STAMP_STATE_EVENT, listen);
    return () => window.removeEventListener(STAMP_STATE_EVENT, listen);
  }, [id]);
}

/** The mark a send produced: one that wasn't there before, else the newest of its type. */
export function findPressedMark(before: StampMark[], after: StampMark[], type: string): string | null {
  const old = new Set(before.map((m) => m.id));
  const fresh = after.find((m) => !old.has(m.id));
  if (fresh) return fresh.id;
  return after.find((m) => m.type === type)?.id ?? null;
}
