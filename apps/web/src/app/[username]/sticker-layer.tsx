import type { CSSProperties, ReactNode } from "react";

import type { ProfileSticker } from "@/lib/profile-home";
import { StickerArt, isPlusSticker, stickerDef, type StickerDef } from "@/lib/stickers";

/**
 * Where one sticker sits on its block. Shared by the page and the Arrange
 * editor so a sticker lands in the editor exactly where visitors will see it.
 */
export function stickerBoxStyle(st: ProfileSticker, def: StickerDef): CSSProperties {
  const top =
    st.edge === "top" ? `${st.y}px`
    : st.edge === "bottom" ? `calc(100% + ${st.y}px)`
    : `${st.y}%`;
  return {
    position: "absolute",
    left: `${st.x}%`,
    top,
    // Natural size × scale, never more than 45% of the card it's on.
    width: `min(${Math.round(def.viewBox[0] * 0.8 * st.scale)}px, 45%)`,
    aspectRatio: `${def.viewBox[0]} / ${def.viewBox[1]}`,
    transform: `translate(-50%, -50%) rotate(${st.rotate}deg)`,
  };
}

/** The stickers a visitor sees on this page (Plus packs only while the writer has Plus). */
export function visibleStickers(stickers: ProfileSticker[], isPlus: boolean): ProfileSticker[] {
  return stickers.filter((st) => stickerDef(st.key) && (isPlus || !isPlusSticker(st.key)));
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
          const def = stickerDef(st.key);
          if (!def) return null;
          return (
            <span key={st.id} className="sticker" style={stickerBoxStyle(st, def)}>
              <StickerArt def={def} />
            </span>
          );
        })}
      </div>
    </div>
  );
}
