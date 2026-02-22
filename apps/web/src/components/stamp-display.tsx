/**
 * StampDisplay — shows stamp icons in the top-right corner of entry cards.
 * Like postage stamps on a letter. No counts, just presence.
 */

import { STAMP_CONFIG } from "./stamp-config";

interface StampDisplayProps {
  stamps: string[];
  size?: number;
}

export function StampDisplay({ stamps, size = 22 }: StampDisplayProps) {
  if (!stamps || stamps.length === 0) return null;

  return (
    <div className="flex items-center gap-1" aria-label="Stamps on this entry">
      {stamps.map((stampType) => {
        const config = STAMP_CONFIG[stampType];
        if (!config) return null;

        const isSupporter = stampType === "supporter";

        return (
          <div
            key={stampType}
            title={config.description}
            className={`flex-shrink-0${isSupporter ? " stamp-supporter-shimmer" : ""}`}
            style={{
              width: size,
              height: size,
              color: "var(--muted)",
              opacity: 0.7,
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
                filter: "var(--stamp-filter, none)",
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
