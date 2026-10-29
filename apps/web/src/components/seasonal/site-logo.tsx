"use client";

import { useSeason } from "./season-context";
import { BAT_D } from "./halloween-art";

/**
 * The Inkwell logo, dressed for the season. The base image stays
 * /inkwell-logo.svg (dark mode inverts it to white); the season's
 * decorations are an SVG laid over it in the logo's own coordinates
 * (viewBox 0 45 1860 470), drawn in their own colours so they read on both.
 */
export function SiteLogo({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const season = useSeason();
  return (
    <span className={`site-logo${season ? ` site-logo-${season}` : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/inkwell-logo.svg" alt="Inkwell" className={className} style={style} />
      {season === "halloween" && <HalloweenLogo />}
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
      <g transform="translate(930 66)">
        <g className="hl-bat">
          {/* Scaled on its own group: a CSS animation's transform replaces an element's transform attribute. */}
          <g transform="scale(2.7)">
            <path className="hl-bat-body" d={BAT_D} />
          </g>
        </g>
      </g>

      {/* A spider on a thread from the nib's tip. */}
      <g className="hl-spider">
        <path className="hl-thread" d="M1452 452V560" />
        <g transform="translate(1452 566)">
          <path
            className="hl-spider-legs"
            d="M-8 -4L-26 -18L-34 -6M-8 0L-30 -2L-38 10M-8 4L-26 14L-30 28M8 -4L26 -18L34 -6M8 0L30 -2L38 10M8 4L26 14L30 28"
          />
          <ellipse className="hl-spider-body" cx="0" cy="0" rx="13" ry="15" />
          <circle className="hl-spider-eye" cx="-4" cy="-4" r="2.6" />
          <circle className="hl-spider-eye" cx="4" cy="-4" r="2.6" />
        </g>
      </g>
    </svg>
  );
}
