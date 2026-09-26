"use client";

import { BOOK_NEXT_EVENT } from "@/lib/book-events";

/** Phones: turns from the cover to the first entry (swiping works too). */
export function CoverStartButton() {
  return (
    <button
      type="button"
      className="explore-cover-start"
      onClick={() => window.dispatchEvent(new Event(BOOK_NEXT_EVENT))}
    >
      Start reading →
    </button>
  );
}
