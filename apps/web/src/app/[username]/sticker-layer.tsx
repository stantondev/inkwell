import type { CSSProperties, ReactNode } from "react";

import type { ProfileSticker } from "@/lib/profile-home";
import { StickerArt, isPlusSticker, stickerDef } from "@/lib/stickers";

/** Width of a writer's own sticker at scale 1, in px. */
const UPLOAD_BASE = 96;

const isUpload = (st: ProfileSticker) => st.key === "upload";

/**
 * Where one sticker sits on its block. Shared by the page and the Arrange
 * editor so a sticker lands in the editor exactly where visitors will see it.
 * Null for a sticker that can't be drawn (an unknown key, an upload with no picture).
 */
export function stickerBoxStyle(st: ProfileSticker): CSSProperties | null {
  let base: number;
  let ratio: number;
  if (isUpload(st)) {
    if (!st.image_id) return null;
    ratio = st.ratio && st.ratio > 0 ? st.ratio : 1;
    // Tall pictures get a narrower box so they don't tower over the card.
    base = ratio < 1 ? UPLOAD_BASE * Math.max(0.5, ratio) : UPLOAD_BASE;
  } else {
    const def = stickerDef(st.key);
    if (!def) return null;
    base = def.viewBox[0] * 0.8;
    ratio = def.viewBox[0] / def.viewBox[1];
  }
  const top =
    st.edge === "top" ? `${st.y}px`
    : st.edge === "bottom" ? `calc(100% + ${st.y}px)`
    : `${st.y}%`;
  return {
    position: "absolute",
    left: `${st.x}%`,
    top,
    // Natural size × scale, never more than 45% of the card it's on.
    width: `min(${Math.round(base * st.scale)}px, 45%)`,
    aspectRatio: `${ratio}`,
    transform: `translate(-50%, -50%) rotate(${st.rotate}deg)`,
  };
}

/** What a sticker is called (for labels and the editor). */
export function stickerLabel(st: ProfileSticker, ownName?: string | null): string {
  if (isUpload(st)) return ownName || "Your sticker";
  return stickerDef(st.key)?.label ?? "Sticker";
}

/** A sticker's drawing: a pack's SVG, or the writer's own picture. */
export function StickerFace({ st }: { st: ProfileSticker }) {
  if (isUpload(st)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/images/${st.image_id}`}
        alt=""
        draggable={false}
        loading="lazy"
        decoding="async"
        className="sticker-picture"
      />
    );
  }
  const def = stickerDef(st.key);
  return def ? <StickerArt def={def} /> : null;
}

/** Extra classes for a sticker's box (the white die-cut edge). */
export function stickerClasses(st: ProfileSticker): string {
  return isUpload(st) && st.outline !== false ? "sticker-outline" : "";
}

/**
 * The stickers a visitor sees on this page: Plus packs only while the writer
 * has Plus, except Keepsakes a pen pal gave them, which stay.
 */
export function visibleStickers(stickers: ProfileSticker[], isPlus: boolean): ProfileSticker[] {
  return stickers.filter((st) =>
    isUpload(st) ? !!st.image_id : !!stickerDef(st.key) && (isPlus || !!st.gift_id || !isPlusSticker(st.key)),
  );
}

/**
 * A block with its stickers on top. Stickers are decoration: hidden from
 * screen readers and transparent to clicks, so nothing under them stops working.
 */
export function StickerHost({
  stickers,
  accent,
  children,
}: {
  stickers: ProfileSticker[];
  accent: string;
  children: ReactNode;
}) {
  if (stickers.length === 0) return <>{children}</>;
  return (
    <div className="sticker-host" style={{ "--sticker-accent": accent } as CSSProperties}>
      {children}
      <div className="sticker-layer" aria-hidden="true">
        {stickers.map((st) => {
          const box = stickerBoxStyle(st);
          if (!box) return null;
          return (
            <span key={st.id} className={`sticker ${stickerClasses(st)}`} style={box}>
              <StickerFace st={st} />
            </span>
          );
        })}
      </div>
    </div>
  );
}
