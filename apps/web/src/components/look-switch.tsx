"use client";

// Modern / Classic (2004) as a two-option segmented control, shown inside the
// sidebar's account menu and the phone's You sheet. It used to be its own
// navigation row ("Classic view (2004)"), which read like a destination and
// made the sidebar longer; it's a preference, so it sits with the others.
// The current look comes from <body data-look>, read after mount so the
// server and first client render agree.

import { useEffect, useState } from "react";
import { saveSiteLook, type SiteLook } from "@/lib/site-look";

export function LookSwitch({ variant }: { variant: "menu" | "sheet" }) {
  const [look, setLook] = useState<SiteLook>("modern");
  const [busy, setBusy] = useState<SiteLook | null>(null);

  useEffect(() => {
    setLook(document.body.dataset.look === "classic" ? "classic" : "modern");
  }, []);

  async function choose(next: SiteLook) {
    if (next === look || busy) return;
    setBusy(next);
    if (!(await saveSiteLook(next))) setBusy(null);
  }

  const option = (value: SiteLook, label: string, hint: string) => {
    const on = (busy ?? look) === value;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={on}
        className={`look-seg-option${on ? " look-seg-option--on" : ""}`}
        onClick={() => choose(value)}
        disabled={busy !== null}
        title={hint}
      >
        {busy === value ? "…" : label}
      </button>
    );
  };

  return (
    <div className={`look-seg look-seg--${variant}`}>
      <span className="look-seg-label" id={`look-seg-${variant}`}>
        {variant === "sheet" && (
          <span className="you-sheet-row-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="14" rx="1" /><path d="M2 8h20" /><path d="M8 21h8M12 18v3" />
            </svg>
          </span>
        )}
        Look
      </span>
      <div className="look-seg-track" role="radiogroup" aria-labelledby={`look-seg-${variant}`}>
        {option("modern", "Modern", "Inkwell's current design")}
        {option("classic", "Classic", "The 2004 way: one long column of entries")}
      </div>
    </div>
  );
}
