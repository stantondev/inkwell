"use client";

/**
 * The first leaf of the album: every design Inkwell has issued, printed
 * faintly the way old albums printed a space for each stamp. Designs you've
 * received have one mounted over the printing, with how many you have.
 * Choosing one shows where those stamps are in the album.
 */

import { StampArt } from "@/components/stamp-art";
import { STAMP_CONFIG, stampSeed, type StampSheet } from "@/components/stamp-config";
import type { AlbumStamp } from "./stamp-album";
import s from "./stamp-book.module.css";

const SECTIONS: { sheet: StampSheet; title: string }[] = [
  { sheet: "everyday", title: "Everyday issue" },
  { sheet: "issue", title: "Issues" },
  { sheet: "keepsake", title: "Keepsakes" },
  { sheet: "abroad", title: "From abroad" },
  { sheet: "retired", title: "Withdrawn" },
];

export function BookCatalogue({
  stamps,
  artWidth,
  highlight,
  onPick,
}: {
  stamps: AlbumStamp[];
  artWidth: number;
  highlight: string | null;
  onPick: (type: string) => void;
}) {
  const counts = new Map<string, number>();
  const latest = new Map<string, AlbumStamp>();
  for (const st of stamps) {
    counts.set(st.type, (counts.get(st.type) ?? 0) + 1);
    const prev = latest.get(st.type);
    if (!prev || (st.stamped_at || "") > (prev.stamped_at || "")) latest.set(st.type, st);
  }
  const designs = Object.keys(STAMP_CONFIG);

  return (
    <>
      <h2 className={s.catTitle}>Catalogue</h2>
      <p className={s.catSub}>of the stamps of Inkwell</p>
      <div className={s.catOrnament} aria-hidden="true">
        ✶ ✶ ✶
      </div>
      <div className={s.catSections}>
      {SECTIONS.map(({ sheet, title }) => {
        const keys = designs.filter((k) => STAMP_CONFIG[k].sheet === sheet);
        // Withdrawn designs only appear for people who have one.
        const shown = sheet === "retired" ? keys.filter((k) => counts.get(k)) : keys;
        if (!shown.length) return null;
        return (
          <section
            key={sheet}
            className={s.catSection}
            style={{ flex: `${shown.length} 1 calc(${Math.min(shown.length, 4) * 25}% - 14px)` }}
          >
            <h3>{title}</h3>
            <div className={s.catGrid} style={{ "--cols": Math.min(shown.length, 4) } as React.CSSProperties}>
              {shown.map((k) => {
                const info = STAMP_CONFIG[k];
                const n = counts.get(k) ?? 0;
                const sample = latest.get(k);
                const lean = `${(stampSeed(k) * 4 - 2).toFixed(1)}deg`;
                const space = (
                  <span className={s.catSpace}>
                    <StampArt type={k} width={artWidth} className={s.catPrinted} />
                    {sample && (
                      <span className={s.catMounted} style={{ "--lean": lean } as React.CSSProperties}>
                        <StampArt type={k} width={artWidth} emoji={sample.emoji} emojiUrl={sample.emoji_url} />
                      </span>
                    )}
                  </span>
                );
                const caption = (
                  <>
                    <span className={s.catName}>{info.label}</span>
                    <span className={s.catCount}>{n > 1 ? `× ${n}` : ""}</span>
                  </>
                );
                return n ? (
                  <button
                    key={k}
                    type="button"
                    className={s.catItem}
                    aria-pressed={highlight === k}
                    title={highlight === k ? "Show every stamp again" : `Find your ${info.label} stamps in the album`}
                    onClick={() => onPick(k)}
                  >
                    {space}
                    {caption}
                  </button>
                ) : (
                  <span key={k} className={s.catItem} title={`${info.label}: “${info.description}”`}>
                    {space}
                    {caption}
                  </span>
                );
              })}
            </div>
          </section>
        );
      })}
      </div>
      <p className={s.catFoot}>
        {info()}
      </p>
    </>
  );

  function info() {
    const kinds = new Set(stamps.map((st) => st.type)).size;
    if (!stamps.length) return "Each stamp a reader sends you is mounted here, over its printed space.";
    return kinds === 1 ? "Choose a stamp to find it in your album." : "Choose a design to find those stamps in your album.";
  }
}
