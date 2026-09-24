"use client";

import { useState, useId } from "react";

// On phones, Feed and Explore stacked a source switch, sort toggles and a row
// of category pills above the reader, so the first entry started ~650px down
// an 812px screen. Below lg they now fold behind one "Filters" row that says
// what's active; on desktop the controls show as before.
export function MobileFilters({
  summary,
  active,
  children,
}: {
  /** e.g. "Poetry · Most inked", or "Everything, newest first". */
  summary: string;
  /** True when anything other than the defaults is chosen. */
  active: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className={`mobile-filters${open ? " is-open" : ""}`}>
      <div className="mx-auto max-w-7xl px-4">
        <button
          type="button"
          className="mobile-filters-toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="4" y1="6" x2="20" y2="6" /><line x1="7" y1="12" x2="17" y2="12" /><line x1="10" y1="18" x2="14" y2="18" />
          </svg>
          <span className="mobile-filters-label">Filters</span>
          <span className={`mobile-filters-summary${active ? " is-active" : ""}`}>{summary}</span>
          <svg className="mobile-filters-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>
      <div id={panelId} className="mobile-filters-panel">
        {children}
      </div>
    </div>
  );
}
