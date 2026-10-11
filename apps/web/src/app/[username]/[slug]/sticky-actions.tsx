"use client";

import { useState } from "react";
import { OPEN_JOT_EVENT } from "@/lib/stickies";
import type { JotEditDetail } from "@/components/jot-composer";
import { DeleteEntryDialog } from "./delete-entry-dialog";

/** Edit (in the Jot composer) and delete, for the writer of a sticky. */
export function StickyActions({ sticky, username }: { sticky: JotEditDetail; username: string }) {
  const [confirming, setConfirming] = useState(false);

  function edit() {
    window.dispatchEvent(new CustomEvent<JotEditDetail>(OPEN_JOT_EVENT, { detail: sticky }));
  }

  const btn = "text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors disabled:opacity-50";
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={edit} className={btn} style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
        Edit
      </button>
      <button type="button" onClick={() => setConfirming(true)} className={btn} style={{ borderColor: "var(--border)", color: "var(--danger)" }}>
        Delete
      </button>
      {sticky.id && (
        <DeleteEntryDialog
          open={confirming}
          onClose={() => setConfirming(false)}
          entryId={sticky.id}
          username={username}
          kind="sticky"
        />
      )}
    </div>
  );
}
