"use client";

/**
 * StampDisplay — shows stamps as stacked mini postage stamps on entry cards.
 * Stamps overlap slightly for a collected-on-paper feel.
 * Hover/tap reveals a popup with all stamps at full size.
 */

import { useState, useRef } from "react";
import { StampFrame, type StampSize } from "./stamp-frame";
import { resolveStampType } from "./stamp-config";
import { FloatingPopup } from "./floating-popup";

interface StampDisplayProps {
  stamps: string[];
  /** Size of the stacked mini-stamps */
  size?: StampSize;
  /** Show hover popup with full-size stamps */
  showPopup?: boolean;
}

export function StampDisplay({ stamps, size = "md", showPopup = true }: StampDisplayProps) {
  const [hovered, setHovered] = useState(false);
  const stackRef = useRef<HTMLDivElement>(null);

  if (!stamps || stamps.length === 0) return null;

  const resolvedStamps = stamps.map(resolveStampType);

  return (
    <div
      ref={stackRef}
      className="stamp-stack"
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
      {resolvedStamps.map((stampType, i) => (
        <StampFrame
          key={stampType}
          stampType={stampType}
          size={size}
          style={{ zIndex: resolvedStamps.length - i }}
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
