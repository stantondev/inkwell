"use client";

import { useState } from "react";
import { ReportModal } from "@/components/report-modal";

export function ReportButton({ entryId }: { entryId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center transition-opacity hover:opacity-80 cursor-pointer"
        style={{ color: "var(--muted)" }}
        title="Report entry"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
          <line x1="4" y1="22" x2="4" y2="15" />
        </svg>
      </button>
      {open && <ReportModal entryId={entryId} onClose={() => setOpen(false)} />}
    </>
  );
}
