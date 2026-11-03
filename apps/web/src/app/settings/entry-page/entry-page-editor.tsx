"use client";

import { useState } from "react";
import Link from "next/link";
import { blackletter } from "@/app/[username]/[slug]/initial-fonts";
import { EntrySignoff } from "@/app/[username]/[slug]/entry-parts";
import {
  DEFAULT_ENTRY_PAGE,
  ENDINGS,
  INITIALS,
  INKS,
  PAPERS,
  entryPageClasses,
  inkVars,
  type EntryPageStyle,
} from "@/lib/entry-page-style";

// Settings → Entry pages: how an entry looks once a reader opens it.
// Every choice previews on the page at the side; Save stores it.

const SAMPLE =
  "Once in a while a day goes exactly the way you hoped. The light came in sideways this morning and I sat with my coffee longer than I meant to, writing the first lines of something I've been putting off for weeks.";

function MiniInitial({ style, initial }: { style: EntryPageStyle; initial: EntryPageStyle["initial"] }) {
  const classes = entryPageClasses(style, initial);
  return (
    <div className={`ep-mini ${classes.page}`} style={inkVars(style.ink) as React.CSSProperties} aria-hidden="true">
      <div className={`prose-entry ${classes.body}`}>
        <p>Inkwell keeps</p>
      </div>
    </div>
  );
}

export function EntryPageEditor({
  initial,
  isPlus,
  accent,
  name,
}: {
  initial: EntryPageStyle;
  isPlus: boolean;
  accent: string | null;
  name: string;
}) {
  const [style, setStyle] = useState<EntryPageStyle>(initial);
  const [saved, setSaved] = useState<EntryPageStyle>(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const dirty = JSON.stringify(style) !== JSON.stringify(saved);
  const set = <K extends keyof EntryPageStyle>(key: K, value: EntryPageStyle[K]) => {
    setStyle((s) => ({ ...s, [key]: value }));
    setStatus("idle");
  };

  async function save() {
    setStatus("saving");
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { entry_page: style } }),
      });
      if (!res.ok) throw new Error();
      setSaved(style);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  const classes = entryPageClasses(style, style.initial);
  const vars = inkVars(style.ink, accent) as React.CSSProperties;

  return (
    <div className={`ep-shell ${blackletter.variable}`}>
      <div className="ep-options">
        <section className="ep-section">
          <h2 className="ep-heading">First letter</h2>
          <p className="ep-hint">The large capital your entries open with. Readers see it when they open an entry with a title.</p>
          <div className="ep-grid">
            {INITIALS.map((o) => {
              const locked = !!o.plus && !isPlus;
              return (
                <button
                  key={o.id}
                  type="button"
                  className="ep-card"
                  aria-pressed={style.initial === o.id}
                  disabled={locked}
                  onClick={() => set("initial", o.id)}
                >
                  <MiniInitial style={style} initial={o.id} />
                  <span className="ep-card-label">
                    {o.label}
                    {o.plus && <span className="ep-plus">Plus</span>}
                  </span>
                  <span className="ep-card-blurb">{o.blurb}</span>
                </button>
              );
            })}
          </div>
          {!isPlus && (
            <p className="ep-hint">
              Inkwell Illuminated comes with Plus. <Link href="/settings/billing">About Plus</Link>
            </p>
          )}
        </section>

        <section className="ep-section">
          <h2 className="ep-heading">Ink</h2>
          <div className="ep-swatches" role="radiogroup" aria-label="Ink for the first letter">
            {INKS.map((o) => (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={style.ink === o.id}
                className="ep-swatch"
                onClick={() => set("ink", o.id)}
              >
                <span className="ep-swatch-dot" style={{ background: inkVars(o.id, accent)["--initial-tile"] }} />
                {o.label}
              </button>
            ))}
          </div>
        </section>

        <section className="ep-section">
          <h2 className="ep-heading">Paper</h2>
          <div className="ep-grid ep-grid--papers">
            {PAPERS.map((o) => (
              <button
                key={o.id}
                type="button"
                className="ep-card"
                aria-pressed={style.paper === o.id}
                onClick={() => set("paper", o.id)}
              >
                <span className={`ep-paper journal-page entry-letter page-paper-${o.id}`} aria-hidden="true" />
                <span className="ep-card-label">{o.label}</span>
                <span className="ep-card-blurb">{o.blurb}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="ep-section">
          <h2 className="ep-heading">Ending</h2>
          <div className="ep-grid ep-grid--endings">
            {ENDINGS.map((o) => (
              <button
                key={o.id}
                type="button"
                className="ep-card ep-card--ending"
                aria-pressed={style.ending === o.id}
                onClick={() => set("ending", o.id)}
              >
                <span className="ep-ending" style={vars}>
                  {o.id === "none" ? <span className="ep-card-blurb">—</span> : <EntrySignoff name="" ending={o.id} signature={false} />}
                </span>
                <span className="ep-card-label">{o.label}</span>
              </button>
            ))}
          </div>
          <label className="ep-check">
            <input type="checkbox" checked={style.signature} onChange={(e) => set("signature", e.target.checked)} />
            Sign each entry with my name in handwriting
          </label>
        </section>

        <div className="ep-actions">
          <button type="button" className="ep-save" onClick={save} disabled={!dirty || status === "saving"}>
            {status === "saving" ? "Saving…" : "Save"}
          </button>
          <button type="button" className="ep-reset" onClick={() => setStyle(DEFAULT_ENTRY_PAGE)}>
            Back to Inkwell&rsquo;s default
          </button>
          <span className="ep-status" role="status">
            {status === "saved" && !dirty ? "Saved. Your entries look like this now." : status === "error" ? "Couldn't save. Try again." : ""}
          </span>
        </div>
      </div>

      <div className="ep-preview-wrap">
        <p className="ep-preview-label">What readers see</p>
        <div className={`ep-preview journal-page rounded-2xl border ${classes.page}`} style={{ borderColor: "var(--border)", ...vars }}>
          <p className="entry-dateline">Tuesday, November 3, 2026</p>
          <h3 className="entry-letter-title ep-preview-title">A slow morning</h3>
          <div className={`prose-entry ${classes.body}`}>
            <p>{SAMPLE}</p>
            <p>Some days ask for nothing more than that.</p>
          </div>
          <EntrySignoff name={name} ending={style.ending} signature={style.signature} />
        </div>
      </div>
    </div>
  );
}
