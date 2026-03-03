"use client";

/**
 * StampDisplay — shows stamps as mini postage stamps on entry cards.
 * Dynamically shrinks stamps as more are added so they all fit in a row.
 * Hover/tap reveals a popup with all stamps at full size with labels.
 */

import { useState, useRef } from "react";
import { StampFrame, type StampSize } from "./stamp-frame";
import { resolveStampType } from "./stamp-config";
import { FloatingPopup } from "./floating-popup";

interface StampDisplayProps {
  stamps: string[];
  /** Maximum stamp size — actual size may shrink based on stamp count */
  size?: StampSize;
  /** Show hover popup with full-size stamps */
  showPopup?: boolean;
}

/** Pick the right stamp size so they all fit without overlapping */
function getAdaptiveSize(count: number, maxSize: StampSize): StampSize {
  const sizeOrder: StampSize[] = ["xs", "sm", "md", "lg", "xl"];
  const maxIdx = sizeOrder.indexOf(maxSize);

  // Based on count, determine the ideal size
  let idealSize: StampSize;
  if (count <= 1) idealSize = maxSize;
  else if (count <= 3) idealSize = "sm";
  else idealSize = "xs"; // 4-7 stamps

  // Don't go larger than maxSize
  const idealIdx = sizeOrder.indexOf(idealSize);
  return sizeOrder[Math.min(idealIdx, maxIdx)];
}

export function StampDisplay({ stamps, size = "md", showPopup = true }: StampDisplayProps) {
  const [hovered, setHovered] = useState(false);
  const stackRef = useRef<HTMLDivElement>(null);

  if (!stamps || stamps.length === 0) return null;

  const resolvedStamps = stamps.map(resolveStampType);
  const adaptiveSize = getAdaptiveSize(resolvedStamps.length, size);

  return (
    <div
      ref={stackRef}
      className="stamp-row"
      aria-label="Stamps on this entry"
      onMouseEnter={() => showPopup && setHovered(true)}
      onMouseLeave={() => showPopup && setHovered(false)}
      onClick={(e) => {
        // Touch devices: toggle popup on tap
        if (showPopup && "ontouchstart" in window) {
          e.stopPropagation();
          setHovered((prev) => !prev);
        }
      }}
      style={{ cursor: showPopup && resolvedStamps.length > 0 ? "pointer" : "default" }}
    >
      {resolvedStamps.map((stampType) => (
        <StampFrame
          key={stampType}
          stampType={stampType}
          size={adaptiveSize}
        />
      ))}

      {showPopup && (
        <FloatingPopup
          anchorRef={stackRef}
          open={hovered}
          onClose={() => setHovered(false)}
          placement="bottom"
          className="rounded-xl border shadow-lg"
          style={{
            background: "var(--surface)",
            borderColor: "var(--border)",
          }}
        >
          <div className="stamp-hover-detail">
            {resolvedStamps.map((stampType) => (
              <StampFrame
                key={stampType}
                stampType={stampType}
                size="lg"
                showLabel
              />
            ))}
          </div>
        </FloatingPopup>
      )}
    </div>
  );
}
