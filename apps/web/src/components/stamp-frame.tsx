/**
 * StampFrame — wraps a stamp icon in a postage stamp visual frame.
 * Renders the scalloped/perforated border as inline SVG,
 * with the stamp icon and optional label inside.
 */

import { STAMP_CONFIG, resolveStampType } from "./stamp-config";

export type StampSize = "xs" | "sm" | "md" | "lg" | "xl";

interface StampFrameProps {
  stampType: string;
  size?: StampSize;
  className?: string;
  showLabel?: boolean;
  interactive?: boolean;
  style?: React.CSSProperties;
  onClick?: () => void;
  title?: string;
}

// Size dimensions: width x height (portrait rectangle ~9:11 ratio)
const SIZE_MAP: Record<StampSize, { w: number; h: number; labelVisible: boolean; simplified: boolean }> = {
  xs: { w: 20, h: 24, labelVisible: false, simplified: true },
  sm: { w: 28, h: 34, labelVisible: false, simplified: true },
  md: { w: 36, h: 44, labelVisible: false, simplified: false },
  lg: { w: 52, h: 64, labelVisible: true, simplified: false },
  xl: { w: 64, h: 78, labelVisible: true, simplified: false },
};

/**
 * Generate an SVG path string for a rectangle with semicircular scalloped notches
 * along all four edges. The notches are the "perforation holes" of a postage stamp.
 */
function generateScallopedPath(w: number, h: number, notchRadius: number): string {
  const nr = notchRadius;
  const spacing = nr * 2.8; // distance between notch centers
  const margin = nr * 1.5; // inset from corners

  const segments: string[] = [];

  // Start at top-left corner (with small rounded corner)
  segments.push(`M ${margin} 0`);

  // Top edge — scallops going right
  const topNotches = Math.max(1, Math.floor((w - 2 * margin) / spacing));
  const topStart = margin;
  const topAvail = w - 2 * margin;
  const topSpacing = topAvail / topNotches;
  for (let i = 0; i < topNotches; i++) {
    const cx = topStart + topSpacing * (i + 0.5);
    segments.push(`L ${cx - nr} 0`);
    segments.push(`A ${nr} ${nr} 0 0 1 ${cx + nr} 0`);
  }
  segments.push(`L ${w - margin} 0`);

  // Top-right corner
  segments.push(`L ${w} 0`);
  segments.push(`L ${w} ${margin}`);

  // Right edge — scallops going down
  const rightNotches = Math.max(1, Math.floor((h - 2 * margin) / spacing));
  const rightAvail = h - 2 * margin;
  const rightSpacing = rightAvail / rightNotches;
  for (let i = 0; i < rightNotches; i++) {
    const cy = margin + rightSpacing * (i + 0.5);
    segments.push(`L ${w} ${cy - nr}`);
    segments.push(`A ${nr} ${nr} 0 0 1 ${w} ${cy + nr}`);
  }
  segments.push(`L ${w} ${h - margin}`);

  // Bottom-right corner
  segments.push(`L ${w} ${h}`);
  segments.push(`L ${w - margin} ${h}`);

  // Bottom edge — scallops going left
  const bottomNotches = topNotches;
  const bottomSpacing = topSpacing;
  for (let i = bottomNotches - 1; i >= 0; i--) {
    const cx = topStart + bottomSpacing * (i + 0.5);
    segments.push(`L ${cx + nr} ${h}`);
    segments.push(`A ${nr} ${nr} 0 0 1 ${cx - nr} ${h}`);
  }
  segments.push(`L ${margin} ${h}`);

  // Bottom-left corner
  segments.push(`L 0 ${h}`);
  segments.push(`L 0 ${h - margin}`);

  // Left edge — scallops going up
  const leftNotches = rightNotches;
  const leftSpacing = rightSpacing;
  for (let i = leftNotches - 1; i >= 0; i--) {
    const cy = margin + leftSpacing * (i + 0.5);
    segments.push(`L 0 ${cy + nr}`);
    segments.push(`A ${nr} ${nr} 0 0 1 0 ${cy - nr}`);
  }
  segments.push(`L 0 ${margin}`);

  // Close to top-left
  segments.push(`L 0 0`);
  segments.push(`L ${margin} 0`);
  segments.push("Z");

  return segments.join(" ");
}

export function StampFrame({
  stampType: rawStampType,
  size = "md",
  className = "",
  showLabel,
  interactive = false,
  style,
  onClick,
  title,
}: StampFrameProps) {
  const stampType = resolveStampType(rawStampType);
  const config = STAMP_CONFIG[stampType];
  if (!config) return null;

  const { w, h, labelVisible, simplified } = SIZE_MAP[size];
  const shouldShowLabel = showLabel !== undefined ? showLabel : labelVisible;
  const isFirstClass = stampType === "first_class";

  // For simplified (xs/sm), use a simpler dashed border instead of full scallops
  if (simplified) {
    return (
      <div
        className={`stamp-frame stamp-frame-${size} ${isFirstClass ? "stamp-first-class-shimmer" : ""} ${interactive ? "stamp-frame-interactive" : ""} ${className}`}
        data-stamp={stampType}
        style={{ width: w, height: h, ...style }}
        onClick={onClick}
        title={title || config.description}
      >
        <svg
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="stamp-frame-border"
        >
          <rect
            x="1"
            y="1"
            width={w - 2}
            height={h - 2}
            rx="1.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="2 1.5"
            opacity="0.6"
            fill="currentColor"
            fillOpacity="0.04"
          />
        </svg>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={config.icon}
          alt={config.label}
          className="stamp-frame-icon"
          draggable={false}
        />
      </div>
    );
  }

  // Full scalloped border for md/lg/xl
  const notchRadius = size === "md" ? 1.8 : size === "lg" ? 2.2 : 2.5;
  const scallopedPath = generateScallopedPath(w, h, notchRadius);

  return (
    <div
      className={`stamp-frame stamp-frame-${size} ${isFirstClass ? "stamp-first-class-shimmer" : ""} ${interactive ? "stamp-frame-interactive" : ""} ${className}`}
      data-stamp={stampType}
      style={{ width: w, height: shouldShowLabel ? h + 16 : h, ...style }}
      onClick={onClick}
      title={title || config.description}
    >
      <div className="stamp-frame-inner" style={{ width: w, height: h }}>
        <svg
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="stamp-frame-border"
        >
          {/* Background fill inside scalloped shape */}
          <path d={scallopedPath} fill="currentColor" fillOpacity="0.05" />
          {/* Scalloped border */}
          <path d={scallopedPath} stroke="currentColor" strokeWidth="1.2" opacity="0.55" fill="none" />
        </svg>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={config.icon}
          alt={config.label}
          className="stamp-frame-icon"
          draggable={false}
        />
      </div>
      {shouldShowLabel && (
        <span className="stamp-frame-label">{config.label}</span>
      )}
    </div>
  );
}
