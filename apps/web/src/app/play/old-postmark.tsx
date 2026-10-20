import { useId } from "react";
import styles from "./play.module.css";

/** A worn 1819-style postmark: town round the top, date in the middle. */
export function OldPostmark({
  town,
  date,
  year,
  className,
  half = false,
}: {
  town: string;
  date: string;
  year: string;
  className?: string;
  /** Only the left half survived. */
  half?: boolean;
}) {
  const rid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const arc = `dlo-arc-${rid}`;
  const wear = `dlo-wear-${rid}`;
  const cut = `dlo-cut-${rid}`;
  // Fit the town round the top of the ring.
  const townSize = Math.min(12.5, 118 / Math.max(6, town.length * 0.74));
  return (
    <svg viewBox="0 0 100 100" className={`${styles.postmark} ${className ?? ""}`} aria-hidden="true" focusable="false">
      <defs>
        <filter id={wear} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.6 1.25" result="holes" />
          <feComposite in="SourceGraphic" in2="holes" operator="in" />
        </filter>
        {half && (
          <clipPath id={cut}>
            <path d="M0 0 H54 L50 14 L57 27 L49 41 L56 55 L48 69 L55 83 L50 100 H0 Z" />
          </clipPath>
        )}
      </defs>
      <g filter={`url(#${wear})`} clipPath={half ? `url(#${cut})` : undefined} fill="currentColor" stroke="currentColor">
        <circle cx="50" cy="50" r="44" fill="none" strokeWidth="3.2" />
        <circle cx="50" cy="50" r="30" fill="none" strokeWidth="1.6" />
        <path id={arc} d="M13 50 A37 37 0 1 1 87 50" fill="none" stroke="none" />
        <text fontFamily="Georgia, serif" fontSize={townSize} fontWeight="700" letterSpacing={town.length > 10 ? 0.8 : 2} stroke="none">
          <textPath href={`#${arc}`} startOffset="50%" textAnchor="middle">
            {town}
          </textPath>
        </text>
        <text x="50" y="52" textAnchor="middle" fontFamily="Georgia, serif" fontSize="13" fontWeight="700" stroke="none">
          {date}
        </text>
        <text x="50" y="67" textAnchor="middle" fontFamily="Georgia, serif" fontSize="11" stroke="none">
          {year}
        </text>
        <path d="M34 76 h32" strokeWidth="1.4" fill="none" />
      </g>
    </svg>
  );
}
