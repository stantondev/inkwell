"use client";

import { useEffect, useRef, useState } from "react";

import type { ProfileBlock, ProfileBlockConfig, StickyColor } from "@/lib/profile-home";
import { BLOCK_INFO } from "@/lib/home-edit";
import { resizeEntryImage } from "@/lib/image-utils";
import type { ProfileContext } from "@/app/[username]/profile-layout";
import s from "./arrange.module.css";

const NOTE_STYLES = [
  { id: "sticky", label: "Sticky note" },
  { id: "card", label: "Card" },
  { id: "index", label: "Index card" },
  { id: "letter", label: "Letter" },
];
const COLORS: StickyColor[] = ["yellow", "pink", "blue", "green", "lilac", "peach"];
const PHOTO_STYLES = [
  { id: "polaroid", label: "Polaroid" },
  { id: "taped", label: "Taped in" },
  { id: "plain", label: "Plain" },
];
const DIVIDER_STYLES = [
  { id: "line", label: "Theme line" },
  { id: "wavy", label: "Wavy" },
  { id: "stars", label: "Stars" },
  { id: "stitch", label: "Stitched" },
];
const NOW_SUGGESTIONS = ["Reading", "Listening to", "Watching", "Playing", "Eating", "Feeling", "Thinking about", "Learning"];

/**
 * Settings for one block. Changes show on the page as they're made; the
 * first change of a visit goes into Undo as one step.
 */
export function BlockSettings({
  block,
  ctx,
  onChange,
  onClose,
}: {
  block: ProfileBlock;
  ctx: ProfileContext;
  onChange: (config: ProfileBlockConfig, firstChange: boolean) => void;
  onClose: () => void;
}) {
  const changed = useRef(false);
  const panel = useRef<HTMLDivElement>(null);
  const c = block.config;
  const set = (config: ProfileBlockConfig) => {
    onChange(config, !changed.current);
    changed.current = true;
  };

  useEffect(() => {
    changed.current = false;
    panel.current?.querySelector<HTMLElement>("input, textarea, select, button[data-first]")?.focus();
  }, [block.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={s.sheetBackdrop} onClick={onClose}>
      <div
        ref={panel}
        className={s.sheet}
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${BLOCK_INFO[block.type].label}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={s.trayHead}>
          <h2>{BLOCK_INFO[block.type].label}</h2>
          <button type="button" className={s.doneBtn} onClick={onClose}>Done</button>
        </div>
        <div className={s.sheetBody}>
          {block.type === "note" && (
            <>
              <Choice label="Looks like" options={NOTE_STYLES} value={c.style ?? "sticky"} onPick={(style) => set({ style })} />
              {(c.style ?? "sticky") === "sticky" && (
                <fieldset className={s.field}>
                  <legend>Colour</legend>
                  <div className={s.swatches}>
                    {COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={s.swatch}
                        style={{ background: `var(--sticky-${color})` }}
                        aria-label={color}
                        aria-pressed={(c.color ?? "yellow") === color}
                        onClick={() => set({ color })}
                      />
                    ))}
                  </div>
                </fieldset>
              )}
              <Text label={c.style === "letter" ? "Greeting (optional)" : "Title (optional)"} placeholder={c.style === "letter" ? "Dear reader," : ""} value={c.title ?? ""} max={80} onChange={(title) => set({ title })} />
              <Area label={c.style === "letter" ? "Your letter" : "Note"} value={c.body ?? ""} max={2000} rows={7} onChange={(body) => set({ body })} />
              {c.style === "letter" && <p className={s.fieldHint}>Signed with your name, {ctx.profile.display_name || ctx.username}.</p>}
            </>
          )}

          {block.type === "photo" && <PhotoFields c={c} set={set} />}

          {block.type === "quote" && (
            <>
              <Area label="The words" value={c.text ?? ""} max={500} rows={5} onChange={(text) => set({ text })} />
              <Text label="Who said it (optional)" value={c.cite ?? ""} max={100} onChange={(cite) => set({ cite })} />
            </>
          )}

          {block.type === "now" && <NowFields c={c} set={set} />}

          {block.type === "countdown" && (
            <>
              <Text label="What it's for" placeholder="my birthday, spring, NaNoWriMo…" value={c.label ?? ""} max={80} onChange={(label) => set({ label })} />
              <label className={s.field}>
                <span>Date</span>
                <input type="date" value={c.date ?? ""} onChange={(e) => set({ date: e.target.value || null })} />
              </label>
              <p className={s.fieldHint}>Counts the days until it, or since it once it&apos;s passed.</p>
            </>
          )}

          {block.type === "links" && <LinkFields c={c} set={set} />}

          {block.type === "divider" && (
            <Choice label="Style" options={DIVIDER_STYLES} value={c.style ?? "line"} onPick={(style) => set({ style })} />
          )}

          {block.type === "entries" && (
            <>
              <Choice
                label="How many"
                options={[
                  { id: "all", label: "All, with pages" },
                  { id: "3", label: "Latest 3" },
                  { id: "6", label: "Latest 6" },
                  { id: "9", label: "Latest 9" },
                  { id: "12", label: "Latest 12" },
                ]}
                value={c.limit ? String(c.limit) : "all"}
                onPick={(id) => set({ limit: id === "all" ? undefined : Number(id) })}
              />
              <p className={s.fieldHint}>With a number, the page shows just your latest entries and a “See all” link to your whole journal, with search and the archive.</p>
              <Choice
                label="Look"
                options={[
                  { id: "default", label: "As in Customize" },
                  { id: "cards", label: "Cards" },
                  { id: "full", label: "Full posts" },
                  { id: "preview", label: "List" },
                  { id: "magazine", label: "Magazine" },
                ]}
                value={c.display ?? "default"}
                onPick={(id) => set({ display: id === "default" ? undefined : (id as ProfileBlockConfig["display"]) })}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Choice({ label, options, value, onPick }: { label: string; options: { id: string; label: string }[]; value: string; onPick: (id: string) => void }) {
  return (
    <fieldset className={s.field}>
      <legend>{label}</legend>
      <div className={s.choices}>
        {options.map((o, i) => (
          <button key={o.id} type="button" data-first={i === 0 ? "" : undefined} aria-pressed={value === o.id} onClick={() => onPick(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Text({ label, value, onChange, max, placeholder }: { label: string; value: string; onChange: (v: string) => void; max: number; placeholder?: string }) {
  return (
    <label className={s.field}>
      <span>{label}</span>
      <input value={value} maxLength={max} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Area({ label, value, onChange, max, rows }: { label: string; value: string; onChange: (v: string) => void; max: number; rows: number }) {
  return (
    <label className={s.field}>
      <span>{label}</span>
      <textarea value={value} maxLength={max} rows={rows} onChange={(e) => onChange(e.target.value)} />
      <small className={s.count}>{value.length.toLocaleString()} / {max.toLocaleString()}</small>
    </label>
  );
}

function PhotoFields({ c, set }: { c: ProfileBlockConfig; set: (c: ProfileBlockConfig) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const dataUri = await resizeEntryImage(file);
      const res = await fetch("/api/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUri }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          data.error === "storage_limit_exceeded"
            ? "Your picture storage is full. Billing → Image Storage shows what you have."
            : data.error || "That picture didn't upload.",
        );
      }
      set({ image_id: data.data.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "That picture didn't upload.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <>
      <div className={s.field}>
        <span>Picture</span>
        {c.image_id && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/images/${c.image_id}`} alt="" className={s.photoPreview} />
        )}
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
          className="sr-only"
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
        <button type="button" data-first="" className={s.uploadBtn} onClick={() => input.current?.click()} disabled={busy}>
          {busy ? "Uploading…" : c.image_id ? "Choose a different picture" : "Choose a picture"}
        </button>
        {error && <p className={s.fieldError} role="alert">{error}</p>}
      </div>
      <Choice label="Looks like" options={PHOTO_STYLES} value={c.style ?? "polaroid"} onPick={(style) => set({ style })} />
      <Text label="Caption (optional)" value={c.caption ?? ""} max={200} onChange={(caption) => set({ caption })} />
      <Text label="Description for people who can't see it" value={c.alt ?? ""} max={300} onChange={(alt) => set({ alt })} />
      <p className={s.fieldHint}>Screen readers read the description aloud. Without one they read the caption.</p>
    </>
  );
}

function NowFields({ c, set }: { c: ProfileBlockConfig; set: (c: ProfileBlockConfig) => void }) {
  const items = c.items ?? [];
  const update = (next: typeof items) => set({ items: next });
  const unused = NOW_SUGGESTIONS.filter((l) => !items.some((i) => i.label === l));
  return (
    <>
      <div className={s.rows}>
        {items.map((item, n) => (
          <div key={n} className={s.row}>
            <input aria-label="Label" value={item.label} maxLength={30} placeholder="Reading" onChange={(e) => update(items.map((x, i) => (i === n ? { ...x, label: e.target.value } : x)))} />
            <input aria-label={`${item.label || "Line"}`} value={item.value ?? ""} maxLength={120} placeholder="…" onChange={(e) => update(items.map((x, i) => (i === n ? { ...x, value: e.target.value } : x)))} />
            <button type="button" className={s.iconBtn} aria-label="Remove this line" onClick={() => update(items.filter((_, i) => i !== n))}>✕</button>
          </div>
        ))}
      </div>
      {items.length < 8 && (
        <div className={s.suggestions}>
          {unused.slice(0, 5).map((label) => (
            <button key={label} type="button" onClick={() => update([...items, { label, value: "" }])}>＋ {label}</button>
          ))}
          <button type="button" onClick={() => update([...items, { label: "", value: "" }])}>＋ Something else</button>
        </div>
      )}
      <p className={s.fieldHint}>Lines left blank aren&apos;t shown.</p>
    </>
  );
}

function LinkFields({ c, set }: { c: ProfileBlockConfig; set: (c: ProfileBlockConfig) => void }) {
  const items = c.items ?? [];
  const update = (next: typeof items) => set({ items: next });
  return (
    <>
      <Text label="Heading" placeholder="Elsewhere" value={c.title ?? ""} max={60} onChange={(title) => set({ title })} />
      <div className={s.rows}>
        {items.map((item, n) => (
          <div key={n} className={s.row}>
            <input aria-label="Name" value={item.label} maxLength={60} placeholder="My blog" onChange={(e) => update(items.map((x, i) => (i === n ? { ...x, label: e.target.value } : x)))} />
            <input aria-label="Web address" value={item.url ?? ""} maxLength={500} placeholder="example.com" inputMode="url" onChange={(e) => update(items.map((x, i) => (i === n ? { ...x, url: e.target.value } : x)))} />
            <button type="button" className={s.iconBtn} aria-label="Remove this link" onClick={() => update(items.filter((_, i) => i !== n))}>✕</button>
          </div>
        ))}
      </div>
      {items.length < 12 && (
        <div className={s.suggestions}>
          <button type="button" onClick={() => update([...items, { label: "", url: "" }])}>＋ Add a link</button>
        </div>
      )}
      <p className={s.fieldHint}>Web addresses only (https://…). They&apos;re checked when you save.</p>
    </>
  );
}
