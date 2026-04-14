"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { MarginNoteCard } from "./margin-note-card";
import type { MarginNote } from "@/lib/marginalia/types";

interface MarginaliaBottomSheetProps {
  notes: MarginNote[];
  onClose: () => void;
  viewerId: string;
  entryUserId: string;
  onEdit: (id: string, html: string) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
}

/**
 * Mobile-only bottom sheet for viewing margin notes. Tapped when the
 * reader taps on a highlighted passage. MVP is read-only: creation from
 * mobile is a v2 feature.
 */
export function MarginaliaBottomSheet({
  notes,
  onClose,
  viewerId,
  entryUserId,
  onEdit,
  onDelete,
}: MarginaliaBottomSheetProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    // Lock body scroll while the sheet is open
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted) return null;

  const sheet = (
    <div className="marginalia-sheet-root" role="dialog" aria-label="Marginalia">
      <div className="marginalia-sheet-backdrop" onClick={onClose} />
      <div className="marginalia-sheet-panel">
        <div className="marginalia-sheet-handle" />
        <div className="marginalia-sheet-header">
          <h2>Marginalia</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="marginalia-sheet-body">
          {notes.map((note) => (
            <MarginNoteCard
              key={note.id}
              note={note}
              layoutMode="mobile"
              topPx={null}
              displaced={false}
              focused={false}
              viewerId={viewerId}
              entryUserId={entryUserId}
              onHeight={() => {}}
              onFocus={() => {}}
              onBlur={() => {}}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}
