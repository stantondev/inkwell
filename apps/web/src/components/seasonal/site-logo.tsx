"use client";

import { useSeason } from "./season-context";
import { Bat } from "./bat";
import { Pumpkin } from "./pumpkin";

/**
 * The Inkwell logo, dressed for the season. The image stays for its size
 * and alt text; for Halloween it's hidden and the logo is repainted through
 * it as a mask (`.site-logo-ink`, candlelit orange), with decorations laid
 * over it in the logo's own coordinates (viewBox 0 45 1860 470).
 */
export function SiteLogo({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const season = useSeason();
  return (
    <span className={`site-logo${season ? ` site-logo-${season}` : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/inkwell-logo.svg" alt="Inkwell" className={className} style={style} />
      {season === "halloween" && (
        <>
          <span className="site-logo-ink" aria-hidden="true" />
          <HalloweenLogo />
        </>
      )}
    </span>
  );
}

function HalloweenLogo() {
  return (
    <svg className="site-logo-overlay" viewBox="0 45 1860 470" aria-hidden="true" focusable="false">
      {/* The nib's breather hole lit like a jack-o'-lantern. */}
      <circle className="hl-glow" cx="1648.6" cy="259.3" r="23" />
      <circle className="hl-flame" cx="1648.6" cy="259.3" r="13" />

      {/* A witch's hat perched on the end of the nib. */}
      <g transform="translate(1800 120) rotate(46) scale(1.4)">
        <g className="hl-hat">
          <path
            className="hl-hat-cone"
            d="M-44 -6C-34 -40-22 -78-14 -108C-8 -132 8 -150 40 -158C20 -140 12 -122 10 -100C14 -70 26 -36 38 -6Z"
          />
          <path className="hl-hat-band" d="M-41 -12L35 -12L30 -32L-36 -32Z" />
          <rect className="hl-hat-buckle" x="-10" y="-31" width="16" height="18" rx="2" />
          <ellipse className="hl-hat-brim" cx="-3" cy="-4" rx="78" ry="15" />
        </g>
      </g>

      {/* A bat over the wordmark. */}
      <g className="hl-bat">
        <Bat x={920} y={48} width={300} height={150} flap={0.34} />
      </g>

      {/* A jack-o'-lantern for the full stop (it covers the dot at 1390–1418, 465–493). */}
      <Pumpkin x={1322} y={362} size={150} className="hl-pumpkin" />
    </svg>
  );
}
