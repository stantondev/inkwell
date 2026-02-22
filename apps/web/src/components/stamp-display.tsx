/**
 * StampDisplay — shows stamp icons on entry cards.
 * Like ink stamps pressed onto paper. No counts, just presence.
 * Larger size gives the "real stamp impression" aesthetic.
 */

import { STAMP_CONFIG } from "./stamp-config";

interface StampDisplayProps {
  stamps: string[];
  /** Default 32px — bigger ink stamp aesthetic */
  size?: number;
}

export function StampDisplay({ stamps, size = 32 }: StampDisplayProps) {
  if (!stamps || stamps.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5" aria-label="Stamps on this entry">
      {stamps.map((stampType) => {
        const config = STAMP_CONFIG[stampType];
        if (!config) return null;

        const isSupporter = stampType === "supporter";

        return (
          <div
            key={stampType}
            title={config.description}
            className={`flex-shrink-0 stamp-impression${isSupporter ? " stamp-supporter-shimmer" : ""}`}
            style={{
              width: size,
              height: size,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={config.icon}
              alt={config.label}
              width={size}
              height={size}
              style={{
                width: size,
                height: size,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
