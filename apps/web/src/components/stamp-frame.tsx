/**
 * StampFrame — one stamp design at a fixed size, optionally labelled. The
 * drawing (with its perforations and paper) comes from lib/stamp-art.ts.
 * For a stamp as it sits on a post, with its postmark, use StampImpression.
 */

import { StampArt } from "./stamp-art";
import { resolveStampType, stampInfo } from "./stamp-config";

export type StampSize = "xs" | "sm" | "md" | "lg" | "xl";

export const STAMP_WIDTHS: Record<StampSize, number> = {
  xs: 22,
  sm: 30,
  md: 38,
  lg: 56,
  xl: 72,
};

interface StampFrameProps {
  stampType: string;
  size?: StampSize;
  className?: string;
  showLabel?: boolean;
  interactive?: boolean;
  style?: React.CSSProperties;
  onClick?: () => void;
  title?: string;
  emoji?: string | null;
  emojiUrl?: string | null;
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
  emoji,
  emojiUrl,
}: StampFrameProps) {
  const stampType = resolveStampType(rawStampType);
  const info = stampInfo(stampType);
  if (!info) return null;
  const width = STAMP_WIDTHS[size];
  const labelled = showLabel ?? (size === "lg" || size === "xl");

  return (
    <span
      className={`stamp-frame stamp-frame-${size}${interactive ? " stamp-frame-interactive" : ""} ${className}`}
      data-stamp={stampType}
      style={{ width, ...style }}
      onClick={onClick}
      title={title ?? info.description}
    >
      <StampArt type={stampType} width={width} emoji={emoji} emojiUrl={emojiUrl} />
      {labelled && <span className="stamp-frame-label">{info.label}</span>}
    </span>
  );
}
