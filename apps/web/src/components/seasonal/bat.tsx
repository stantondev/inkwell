import { BAT_BODY, BAT_WING_L, BAT_WING_R } from "./halloween-art";

/**
 * A bat whose wings beat (CSS `.bat-wing`, globals.css). Its own <svg>, so
 * the wings can turn about their shoulders in the bat's coordinates
 * wherever it's placed (also nested inside another SVG, as in the logo).
 * `flap` is one wingbeat in seconds.
 */
export function Bat({
  className = "",
  flap,
  x,
  y,
  width,
  height,
}: {
  className?: string;
  flap?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}) {
  return (
    <svg
      viewBox="0 0 100 50"
      className={`bat ${className}`}
      x={x}
      y={y}
      width={width}
      height={height}
      overflow="visible"
      aria-hidden="true"
      focusable="false"
      style={flap ? ({ "--flap": `${flap}s` } as React.CSSProperties) : undefined}
    >
      <path className="bat-wing bat-wing-l" d={BAT_WING_L} />
      <path className="bat-wing bat-wing-r" d={BAT_WING_R} />
      <g className="bat-bodyset">
        <path d={BAT_BODY} />
        <circle className="bat-eye" cx="48.3" cy="15.4" r="0.95" />
        <circle className="bat-eye" cx="51.7" cy="15.4" r="0.95" />
      </g>
    </svg>
  );
}
