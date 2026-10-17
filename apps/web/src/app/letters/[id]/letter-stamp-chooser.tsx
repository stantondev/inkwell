"use client";

/**
 * The stamp on a letter's envelope: a small button in the reply bar and in
 * the stationery's corner, opening the same sheet of stamps as posts (a
 * FloatingPopup on desktop, a bottom sheet on phones). Choosing one closes
 * the sheet; there's no note, the letter is the note.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FloatingPopup } from "@/components/floating-popup";
import { StampArt } from "@/components/stamp-art";
import { StampOutlineIcon, StampSheet } from "@/components/stamp-sheet";
import { STAMP_CONFIG, stampInfo } from "@/components/stamp-config";

interface Props {
  value: string | null;
  onChange: (type: string | null) => void;
  isPlus: boolean;
  recipientName: string;
  /** "bar": beside the reply field. "corner": the stationery's top corner. */
  variant: "bar" | "corner";
}

export function LetterStampChooser({ value, onChange, isPlus, recipientName, variant }: Props) {
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [plusHint, setPlusHint] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const close = useCallback(() => {
    if (panelRef.current?.contains(document.activeElement)) buttonRef.current?.focus({ preventScroll: true });
    setOpen(false);
    setPlusHint(false);
  }, []);

  // Escape closes the sheet only, not the stationery behind it: caught on the
  // way down, before the stationery's own listener hears it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      close();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, close]);

  // Phone sheet: the page behind stays put.
  useEffect(() => {
    if (!open || !isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, isMobile]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      panelRef.current
        ?.querySelector<HTMLElement>("[aria-pressed='true'], [data-stamp-choice]:not([aria-disabled='true'])")
        ?.focus({ preventScroll: true });
    }, 60);
    return () => clearTimeout(t);
  }, [open]);

  function choose(type: string) {
    if (STAMP_CONFIG[type]?.plusOnly && !isPlus) {
      setPlusHint(true);
      return;
    }
    onChange(type);
    close();
  }

  const info = value ? stampInfo(value) : null;
  const label = info ? `Stamp on this letter: ${info.label}. Change it.` : "Put a stamp on this letter";

  const panel = (
    <div ref={panelRef} className="stamp-picker-panel letter-stamp-panel" role="dialog" aria-label="Choose a stamp for this letter">
      <StampSheet
        title={`A stamp for ${recipientName}’s envelope`}
        selected={value}
        isPlus={isPlus}
        isMobile={isMobile}
        plusHint={plusHint}
        selectedLabel="on this letter"
        blurbs={{ everyday: "For any letter" }}
        onChoose={choose}
        headerAction={
          value ? (
            <button
              type="button"
              className="stamp-link"
              onClick={() => {
                onChange(null);
                close();
              }}
            >
              No stamp
            </button>
          ) : null
        }
      />
    </div>
  );

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`letter-stamp-trigger letter-stamp-trigger-${variant}${value ? " is-stamped" : ""}`}
        onClick={() => (open ? close() : setOpen(true))}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={info ? `${info.label} · change the stamp` : "Add a stamp"}
      >
        {value ? (
          <StampArt type={value} width={variant === "corner" ? 38 : 20} />
        ) : variant === "corner" ? (
          <span className="letter-stamp-empty">
            <StampOutlineIcon size={16} />
            <span>Stamp</span>
          </span>
        ) : (
          <StampOutlineIcon size={17} />
        )}
      </button>
      {open &&
        (isMobile
          ? createPortal(
              <>
                <div className="comment-sheet-backdrop letter-stamp-backdrop" onClick={close} />
                <div className="comment-sheet stamp-picker-sheet letter-stamp-sheet">
                  <div className="comment-sheet-handle" onClick={close}>
                    <div className="comment-sheet-handle-bar" />
                  </div>
                  {panel}
                </div>
              </>,
              document.body
            )
          : (
            <FloatingPopup
              anchorRef={buttonRef}
              open={open}
              onClose={close}
              placement={variant === "bar" ? "top" : "bottom"}
              className="stamp-picker-popup rounded-xl border shadow-lg"
              style={{ background: "var(--surface)", borderColor: "var(--border)", width: "min(400px, calc(100vw - 24px))" }}
            >
              {panel}
            </FloatingPopup>
          ))}
    </>
  );
}
