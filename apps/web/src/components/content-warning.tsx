"use client";

import { useState } from "react";

interface ContentWarningProps {
  isSensitive: boolean;
  contentWarning?: string | null;
  children: React.ReactNode;
  compact?: boolean;
}

export function ContentWarning({ isSensitive, contentWarning, children, compact }: ContentWarningProps) {
  const [revealed, setRevealed] = useState(false);

  if (!isSensitive || revealed) {
    return <>{children}</>;
  }

  return (
    <div className={`content-warning-overlay${compact ? " content-warning-compact" : ""}`}>
      <div className="content-warning-inner">
        <svg className="content-warning-icon" width={compact ? 20 : 28} height={compact ? 20 : 28} viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        <span className="content-warning-label">Content Warning</span>
        {contentWarning && (
          <span className="content-warning-text">{contentWarning}</span>
        )}
        <button
          type="button"
          className="content-warning-reveal"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setRevealed(true); }}
        >
          Show content
        </button>
      </div>
    </div>
  );
}
