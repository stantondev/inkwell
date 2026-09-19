"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { OPEN_JOT_EVENT } from "@/lib/stickies";
import type { JotEditDetail } from "@/components/jot-composer";

/** Edit (in the Jot composer) and delete, for the writer of a sticky. */
export function StickyActions({ sticky, username }: { sticky: JotEditDetail; username: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  function edit() {
    window.dispatchEvent(new CustomEvent<JotEditDetail>(OPEN_JOT_EVENT, { detail: sticky }));
  }

  async function remove() {
    if (!confirm("Peel off this sticky? It will be deleted for good.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/entries/${sticky.id}`, { method: "DELETE" });
      if (res.ok || res.status === 204) router.push(`/${username}`);
    } finally {
      setDeleting(false);
    }
  }

  const btn = "text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors disabled:opacity-50";
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={edit} className={btn} style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
        Edit
      </button>
      <button type="button" onClick={remove} disabled={deleting} className={btn} style={{ borderColor: "var(--border)", color: "var(--danger, #b42318)" }}>
        {deleting ? "Deleting…" : "Delete"}
      </button>
    </div>
  );
}
