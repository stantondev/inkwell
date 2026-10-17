"use client";

/**
 * The sheet of stamps: everyday stamps, this season's issue, and the
 * Keepsakes sheet (locked for members without Plus). Shared by the post
 * picker (StampPicker) and the envelope stamp on letters.
 */

import { StampArt } from "./stamp-art";
import { STAMP_CONFIG, STAMP_SHEETS, stampsInSheet, type StampSheet as SheetName } from "./stamp-config";

/** A perforated stamp outline (dashed edge = the perforations) with a little picture. */
export function StampOutlineIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={Math.round(size * 1.2)} viewBox="0 0 20 24" aria-hidden="true" className="stamp-trigger-icon">
      <rect x="1" y="1" width="18" height="22" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="1.6 2.1" />
      <rect x="4.5" y="4.5" width="11" height="15" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.75" />
      <path d="M7 15.5c1.2-2.4 2.4-3.4 3-3.4s1.6 1.4 3 3.4" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" opacity="0.75" />
      <circle cx="12.6" cy="8.6" r="1.3" fill="currentColor" opacity="0.75" />
    </svg>
  );
}

interface StampSheetProps {
  title: string;
  /** The design currently chosen (marked on the sheet). */
  selected: string | null;
  isPlus: boolean;
  isMobile: boolean;
  /** Flash the Plus note (someone tried a locked Keepsake). */
  plusHint?: boolean;
  /** Something for the top-right corner, e.g. "Back to your stamp". */
  headerAction?: React.ReactNode;
  /** Shown for the selected stamp in its aria-label. */
  selectedLabel?: string;
  /** Replace a sheet's one-line blurb (letters aren't "pages"). */
  blurbs?: Partial<Record<SheetName, string>>;
  onChoose: (type: string) => void;
}

export function StampSheet({
  title,
  selected,
  isPlus,
  isMobile,
  plusHint = false,
  headerAction,
  selectedLabel = "your stamp",
  blurbs,
  onChoose,
}: StampSheetProps) {
  return (
    <div className="stamp-sheet">
      <div className="stamp-sheet-head">
        <p className="stamp-sheet-title">{title}</p>
        {headerAction}
      </div>
      {STAMP_SHEETS.map(({ sheet: s, title: sheetTitle, blurb }) => {
        const types = stampsInSheet(s);
        if (types.length === 0) return null;
        const locked = s === "keepsake" && !isPlus;
        const issued = s === "issue" ? STAMP_CONFIG[types[0]]?.issued : null;
        return (
          <section key={s} className={`stamp-sheet-section${locked ? " is-locked" : ""}`}>
            <h3 className="stamp-sheet-section-title">
              {sheetTitle}
              <span className="stamp-sheet-section-blurb">{issued ? `Issued ${issued}` : blurbs?.[s] ?? blurb}</span>
            </h3>
            <div className="stamp-sheet-grid">
              {types.map((t) => {
                const info = STAMP_CONFIG[t];
                const isMine = selected === t;
                return (
                  <button
                    key={t}
                    type="button"
                    data-stamp-choice
                    className={`stamp-choice${isMine ? " is-mine" : ""}`}
                    aria-label={`${info.label}: ${info.description}${locked ? " (Plus)" : ""}${isMine ? ` (${selectedLabel})` : ""}`}
                    aria-disabled={locked ? "true" : undefined}
                    aria-pressed={isMine}
                    onClick={() => onChoose(t)}
                  >
                    <StampArt type={t} width={isMobile ? 52 : 50} />
                    <span className="stamp-choice-label">{info.label}</span>
                  </button>
                );
              })}
            </div>
            {locked && (
              <p className={`stamp-sheet-note${plusHint ? " is-flagged" : ""}`}>
                Keepsakes are a Plus sheet.{" "}
                <a href="/settings/billing" className="stamp-link">
                  About Plus
                </a>
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
