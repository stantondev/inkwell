// The stamp a writer last put on a letter, one per conversation, so the next
// letter starts with it. Kept in this browser; when there's nothing here (a
// new device), the thread falls back to the writer's newest stamped letter.
// "none" records that they chose no stamp, so the fallback doesn't override it.

import { STAMP_CONFIG, STAMP_TYPES } from "@/components/stamp-config";

const key = (conversationId: string) => `inkwell-letter-stamp:${conversationId}`;

/** A stamp the picker can offer this writer, else null. */
export function usableLetterStamp(type: string | null | undefined, isPlus: boolean): string | null {
  if (!type || !STAMP_TYPES.includes(type)) return null;
  if (STAMP_CONFIG[type]?.plusOnly && !isPlus) return null;
  return type;
}

/** undefined = nothing remembered; null = they chose no stamp. */
export function loadLetterStamp(conversationId: string): string | null | undefined {
  try {
    const v = window.localStorage.getItem(key(conversationId));
    if (v === null) return undefined;
    return v === "none" ? null : v;
  } catch {
    return undefined;
  }
}

export function saveLetterStamp(conversationId: string, type: string | null): void {
  try {
    window.localStorage.setItem(key(conversationId), type ?? "none");
  } catch {
    // no storage: it's remembered for this visit only
  }
}
