"use client";

/**
 * One stamp up close, under a loupe. Turn it over to read what the sender
 * wrote on the back. From here a stamp can be moved, taken out of the album
 * or mounted, and the arrows walk through the album in order.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { StampImpression } from "@/components/stamp-impression";
import { SenderLink } from "@/components/stamp-popover";
import { formatStampDay, stampInfo } from "@/components/stamp-config";
import { entryLabel, type AlbumStamp } from "./stamp-album";
import s from "./stamp-book.module.css";

export function BookLoupe({
  stamp,
  mounted,
  position,
  fontClass,
  onClose,
  onStep,
  onMove,
  onUnmount,
  onMount,
}: {
  stamp: AlbumStamp;
  mounted: boolean;
  position: { index: number; total: number };
  fontClass: string;
  onClose: () => void;
  onStep: (by: -1 | 1) => void;
  onMove: () => void;
  onUnmount: () => void;
  onMount: () => void;
}) {
  const [flipped, setFlipped] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const info = stampInfo(stamp.type);
  const link = entryLabel(stamp);
  const sender = stamp.sender;

  useEffect(() => setFlipped(false), [stamp.id]);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
      before?.focus?.();
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowRight") onStep(1);
      else if (e.key === "ArrowLeft") onStep(-1);
      else if (e.key === "Tab" && cardRef.current) {
        const f = cardRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, onStep]);

  const width = typeof window !== "undefined" && window.innerWidth < 640 ? 150 : 190;
  const from = stamp.type === "abroad" && stamp.domain ? `from ${stamp.domain}` : null;

  return createPortal(
    <div className={`${s.loupeRoot} ${fontClass}`} role="dialog" aria-modal="true" aria-labelledby="loupe-title">
      <div className={s.loupeBackdrop} onClick={onClose} />
      <div className={s.loupeCard} ref={cardRef}>
        <button ref={closeRef} type="button" className={s.loupeClose} onClick={onClose} aria-label="Close">
          ×
        </button>
        <div className={s.lens}>
          <div className={`${s.flipper} ${flipped ? s.flipped : ""}`}>
            <div className={s.face} aria-hidden={flipped}>
              <StampImpression mark={stamp} width={width} postmark="full" straight />
            </div>
            <div className={`${s.face} ${s.back}`} aria-hidden={!flipped}>
              {stamp.note ? (
                <>
                  <p className={s.backNote}>{stamp.note}</p>
                  <p className={s.backFrom}>— {sender?.display_name || sender?.username || "a reader"}</p>
                </>
              ) : (
                <p className={s.backBlank}>Nothing written on the back.</p>
              )}
            </div>
          </div>
        </div>

        <div className={s.details}>
          <div>
            <h2 id="loupe-title" className={s.detailsKind}>
              {info?.label ?? "Stamp"}
            </h2>
            <p className={s.detailsSays}>{from ?? (info ? `“${info.description}”` : null)}</p>
          </div>
          {sender && (
            <div className={s.detailRow}>
              <span className={s.detailLabel}>From</span>
              <SenderLink sender={sender} size={26} />
            </div>
          )}
          <div className={s.detailRow}>
            <span className={s.detailLabel}>On</span>
            {link ? (
              <Link href={link.href} className="stamp-link">
                {link.text}
              </Link>
            ) : (
              <span>a page that&rsquo;s gone</span>
            )}
          </div>
          <div className={s.detailRow}>
            <span className={s.detailLabel}>Arrived</span>
            <span>{formatStampDay(stamp.stamped_on)}</span>
          </div>
          <button type="button" className={s.readBack} onClick={() => setFlipped((f) => !f)} aria-pressed={flipped}>
            <span aria-hidden="true">↻</span>
            {flipped ? "Turn it back over" : stamp.note ? "Read what they wrote on the back" : "Turn it over"}
          </button>
          <div className={s.loupeActions}>
            {mounted ? (
              <>
                <button type="button" className={s.tbtn} onClick={onMove}>
                  Move it
                </button>
                <button type="button" className={s.tbtn} onClick={onUnmount}>
                  Back in the envelope
                </button>
              </>
            ) : (
              <>
                <button type="button" className={`${s.tbtn} ${s.primary}`} onClick={onMount}>
                  Mount it in the album
                </button>
                <button type="button" className={s.tbtn} onClick={onMove}>
                  Choose a space
                </button>
              </>
            )}
          </div>
          {position.total > 1 && (
            <div className={s.loupeNav}>
              <button type="button" className={`${s.tbtn} ${s.iconBtn}`} onClick={() => onStep(-1)} aria-label="Previous stamp">
                ‹
              </button>
              <span>
                {position.index + 1} of {position.total}
              </span>
              <button type="button" className={`${s.tbtn} ${s.iconBtn}`} onClick={() => onStep(1)} aria-label="Next stamp">
                ›
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
