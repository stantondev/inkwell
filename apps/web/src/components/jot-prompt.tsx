"use client";

import { openJot } from "@/lib/stickies";

/** A little sticky note that opens the Jot composer. */
export function JotPrompt({ label = "Jot something down…" }: { label?: string }) {
  return (
    <button type="button" className="jot-prompt" onClick={openJot}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z" />
        <path d="M15 3v6h6" />
      </svg>
      <span>{label}</span>
    </button>
  );
}
