"use client";

import { useRef, useState } from "react";
import { FloatingPopup } from "@/components/floating-popup";
import { StampDisplay } from "@/components/stamp-display";
import { StampPicker } from "@/components/stamp-picker";
import { StampLetters } from "@/components/stamp-popover";
import type { StampMark } from "@/components/stamp-config";
import { useStampState } from "@/lib/stamp-state";

interface EntryStampsProps {
  entryId: string;
  initialStamps: string[];
  initialMyStamp: string | null;
  initialMarks?: StampMark[] | null;
  initialNote?: string | null;
  initialStampedOn?: string | null;
  writerName?: string | null;
  isOwnEntry: boolean;
  isLoggedIn: boolean;
  isPlus: boolean;
  stampApiPath?: string;
  /** Smaller cluster (sticky pages). */
  size?: "md" | "lg";
}

/**
 * The stamps on an entry page: a cluster of impressions in the corner, the
 * picker for readers, and for the writer a click-through to who sent each
 * stamp and what they wrote on the back.
 */
export function EntryStamps({
  entryId,
  initialStamps,
  initialMyStamp,
  initialMarks,
  initialNote,
  initialStampedOn,
  writerName,
  isOwnEntry,
  isLoggedIn,
  isPlus,
  stampApiPath,
  size = "lg",
}: EntryStampsProps) {
  const [lettersOpen, setLettersOpen] = useState(false);
  const [version, setVersion] = useState(0);
  const anchorRef = useRef<HTMLDivElement>(null);
  useStampState(entryId, () => setVersion((v) => v + 1));

  return (
    <div className="entry-stamps" ref={anchorRef}>
      <StampDisplay
        entryId={entryId}
        stamps={initialStamps}
        marks={initialMarks}
        size={size}
        showPopup={!isOwnEntry}
        onOpen={isOwnEntry ? () => setLettersOpen((v) => !v) : undefined}
        openLabel={isOwnEntry ? "Your stamps: see who sent them and what they wrote" : undefined}
      />

      <StampPicker
        entryId={entryId}
        currentStamp={initialMyStamp}
        currentNote={initialNote}
        currentStampedOn={initialStampedOn}
        currentMarks={initialMarks}
        writerName={writerName}
        isOwnEntry={isOwnEntry}
        isLoggedIn={isLoggedIn}
        isPlus={isPlus}
        stampApiPath={stampApiPath}
      />

      {isOwnEntry && (
        <FloatingPopup
          anchorRef={anchorRef}
          open={lettersOpen}
          onClose={() => setLettersOpen(false)}
          placement="bottom"
          className="rounded-xl border shadow-lg"
          style={{ background: "var(--surface)", borderColor: "var(--border)", width: "min(380px, calc(100vw - 24px))", maxHeight: 520 }}
        >
          <StampLetters entryId={entryId} refreshKey={version} />
        </FloatingPopup>
      )}
    </div>
  );
}
