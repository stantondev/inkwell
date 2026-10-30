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

      {/* A witch's hat seated on the nib's end cap. The cap (the ink arc at
          the top right) runs from (1736, 78) to (1830, 133), measured from the
          logo file: it's cut at about 30°, not square to the nib's 45° body,
          so the hat is turned to sit flush on the cap, centred on its middle. */}
      <g transform="translate(1797 106) rotate(31) scale(1.4)">
        <g className="hl-hat">
          <path
            className="hl-hat-cone"
            d="M-38 -4C-30 -40-16 -86-6 -122C-2 -136 10 -146 22 -150C12 -138 8 -126 8 -110C14 -72 26 -36 38 -4Z"
          />
          <path className="hl-hat-band" d="M-36 -10L36 -10L32 -28L-32 -28Z" />
          <rect className="hl-hat-buckle" x="-8" y="-27" width="16" height="16" rx="2" />
          <ellipse className="hl-hat-brim" cx="0" cy="-2" rx="70" ry="13" />
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
