"use client";

// One-click switch between Modern and Classic (2004) views, in the sidebar
// and the phone's You sheet. The current look comes from <body data-look>,
// read after mount so the server and first client render agree.

import { useEffect, useState } from "react";
import { saveSiteLook, type SiteLook } from "@/lib/site-look";

function LookIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="4" width="20" height="14" rx="1" /><path d="M2 8h20" /><path d="M8 21h8M12 18v3" />
    </svg>
  );
}

export function LookSwitch({ variant }: { variant: "sidebar" | "sheet" }) {
  const [look, setLook] = useState<SiteLook>("modern");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setLook(document.body.dataset.look === "classic" ? "classic" : "modern");
  }, []);

  const next: SiteLook = look === "classic" ? "modern" : "classic";
  const label = busy ? "Switching…" : next === "classic" ? "Classic view (2004)" : "Modern view";

  async function onClick() {
    setBusy(true);
    if (!(await saveSiteLook(next))) setBusy(false);
  }

  if (variant === "sheet") {
    return (
      <button type="button" className="you-sheet-row" onClick={onClick} disabled={busy}>
        <span className="you-sheet-row-icon" aria-hidden="true"><LookIcon size={20} /></span>
        <span className="you-sheet-row-label">{label}</span>
      </button>
    );
  }
  return (
    <button type="button" className="sidebar-nav-link w-full text-left" onClick={onClick} disabled={busy}
      title={next === "classic" ? "See Inkwell the 2004 way: a LiveJournal-style friends page" : "Back to the modern look"}>
      <span className="sidebar-nav-icon"><LookIcon size={16} /></span>
      <span className="sidebar-nav-label">{label}</span>
    </button>
  );
}
