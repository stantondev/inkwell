"use client";

// Choose which userpic an entry or comment wears: your avatar (the default)
// or one of your userpics. Renders nothing for writers with no userpics,
// apart from an optional hint linking to Settings.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FloatingPopup } from "./floating-popup";
import type { Userpic } from "@/lib/userpics";

// One fetch per page load, shared by every picker on the page.
let cached: Promise<Userpic[]> | null = null;
function loadUserpics(): Promise<Userpic[]> {
  if (!cached) {
    cached = fetch("/api/me/icons")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((b) => (b.data ?? []) as Userpic[])
      .catch(() => {
        cached = null;
        return [];
      });
  }
  return cached;
}

export function UserpicPicker({
  value,
  onChange,
  avatarUrl,
  size = 32,
  showHintWhenEmpty = false,
  label,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  avatarUrl: string | null;
  size?: number;
  /** When the writer has no userpics, show a small "Add userpics" link instead of nothing. */
  showHintWhenEmpty?: boolean;
  /** Short text shown before the button, e.g. "Posting as". */
  label?: string;
}) {
  const [pics, setPics] = useState<Userpic[] | null>(null);
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let live = true;
    loadUserpics().then((p) => live && setPics(p));
    return () => { live = false; };
  }, []);

  if (!pics) return null;
  if (pics.length === 0) {
    return showHintWhenEmpty ? (
      <Link href="/settings/userpics" className="text-xs underline" style={{ color: "var(--muted)" }}>
        Add userpics to choose a picture for each entry
      </Link>
    ) : null;
  }

  const chosen = pics.find((p) => p.id === value) ?? null;
  const current = chosen ? `Userpic: ${chosen.keyword}` : "Userpic: your avatar";

  function pick(id: string | null) {
    onChange(id);
    setOpen(false);
  }

  return (
    <>
      {label && <span className="text-xs" style={{ color: "var(--muted)" }}>{label}</span>}
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="userpic-picker-button"
        title={`${current}. Choose another`}
        aria-label={`${current}. Choose another`}
        aria-expanded={open}
        style={{ width: size, height: size }}
      >
        {chosen || avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={chosen ? chosen.url : avatarUrl!} alt="" />
        ) : (
          <span aria-hidden="true">?</span>
        )}
      </button>
      <FloatingPopup anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} placement="bottom">
        <div className="userpic-picker-popup" role="listbox" aria-label="Choose a userpic">
          <button type="button" role="option" aria-selected={!chosen} className="userpic-picker-option"
            data-selected={!chosen} onClick={() => pick(null)}>
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" />
            ) : (
              <span className="userpic-picker-blank" aria-hidden="true" />
            )}
            <span>Your avatar</span>
          </button>
          {pics.map((p) => (
            <button key={p.id} type="button" role="option" aria-selected={p.id === value}
              className="userpic-picker-option" data-selected={p.id === value} onClick={() => pick(p.id)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="" loading="lazy" />
              <span>{p.keyword}</span>
            </button>
          ))}
          <Link href="/settings/userpics" className="userpic-picker-manage">Manage userpics</Link>
        </div>
      </FloatingPopup>
    </>
  );
}
