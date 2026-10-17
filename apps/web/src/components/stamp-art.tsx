/**
 * A stamp drawing (lib/stamp-art.ts) on the page. The SVG strings are built by
 * our own code; "abroad" stamps carry an escaped remote emoji URL. Strings are
 * cached per type, so a feed full of Felt stamps builds the drawing once.
 */
import { stampArtSvg, STAMP_ART_VERSION } from "@/lib/stamp-art";
import { resolveStampType } from "./stamp-config";

const cache = new Map<string, string>();

export function stampSvgFor(type: string, emoji?: string | null, emojiUrl?: string | null): string {
  const t = resolveStampType(type);
  if (t === "abroad") return stampArtSvg(t, { emoji, emojiUrl });
  let svg = cache.get(t);
  if (!svg) {
    svg = stampArtSvg(t);
    cache.set(t, svg);
  }
  return svg;
}

interface StampArtProps {
  type: string;
  /** Width in px; the height follows the stamp's 80:96 shape. */
  width: number;
  emoji?: string | null;
  emojiUrl?: string | null;
  className?: string;
  style?: React.CSSProperties;
}

export function stampImageUrl(type: string): string {
  return `/api/stamps/${resolveStampType(type)}.svg?v=${STAMP_ART_VERSION}`;
}

export function StampArt({ type, width, emoji, emojiUrl, className = "", style }: StampArtProps) {
  const t = resolveStampType(type);
  const height = Math.round((width * 96) / 80);
  // Our own designs load as one cached file each; only a fediverse sender's
  // emoji (different for every stamp) is drawn inline.
  if (t !== "abroad") {
    return (
      <span aria-hidden="true" className={`stamp-art ${className}`} style={{ width, height, ...style }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={stampImageUrl(t)} alt="" width={width} height={height} draggable={false} decoding="async" />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`stamp-art ${className}`}
      style={{ width, height: Math.round((width * 96) / 80), ...style }}
      dangerouslySetInnerHTML={{ __html: stampSvgFor(type, emoji, emojiUrl) }}
    />
  );
}
