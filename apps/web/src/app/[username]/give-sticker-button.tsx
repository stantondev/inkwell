"use client";

/**
 * "Give a sticker" on a pen pal's profile: pick one of Inkwell's stickers or
 * one of your own, add a note, send. It waits in their Gifts drawer
 * (Arrange my page) until they place it. Keepsakes need Plus to give, and
 * stay on their page whatever their plan.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { OwnSticker } from "@/lib/profile-home";
import { STICKER_PACKS, StickerArt } from "@/lib/stickers";

type Choice = { kind: "pack"; key: string; label: string } | { kind: "own"; sticker: OwnSticker };

export function GiveStickerButton({
  username,
  displayName,
  viewerIsPlus,
}: {
  username: string;
  displayName: string;
  viewerIsPlus: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="gift-open-btn"
        onClick={() => setOpen(true)}
        aria-label="Give a sticker"
        title={`Give ${displayName} a sticker for their page`}
      >
        <GiftIcon />
      </button>
      {open && <GiveStickerDialog username={username} displayName={displayName} viewerIsPlus={viewerIsPlus} onClose={() => setOpen(false)} />}
    </>
  );
}

function GiveStickerDialog({
  username,
  displayName,
  viewerIsPlus,
  onClose,
}: {
  username: string;
  displayName: string;
  viewerIsPlus: boolean;
  onClose: () => void;
}) {
  const [own, setOwn] = useState<OwnSticker[]>([]);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/me/stickers")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => live && setOwn(j.data ?? []))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !sending && onClose();
    window.addEventListener("keydown", onKey);
    dialog.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, sending]);

  async function send() {
    if (!choice) return;
    setSending(true);
    setError(null);
    try {
      const body = choice.kind === "pack" ? { key: choice.key, note } : { sticker_id: choice.sticker.id, note };
      const res = await fetch(`/api/users/${encodeURIComponent(username)}/sticker-gifts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Couldn't send that sticker. Try again.");
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send that sticker. Try again.");
    }
    setSending(false);
  }

  const isChosen = (c: Choice) =>
    !!choice &&
    (c.kind === "pack" ? choice.kind === "pack" && choice.key === c.key : choice.kind === "own" && choice.sticker.id === c.sticker.id);

  return createPortal(
    <>
      <div className="gift-backdrop" onClick={() => !sending && onClose()} />
      <div className="gift-dialog" role="dialog" aria-modal="true" aria-labelledby="gift-title" tabIndex={-1} ref={dialog}>
        <div className="gift-head">
          <h2 id="gift-title">Give {displayName} a sticker</h2>
          <button type="button" className="gift-close" onClick={onClose} aria-label="Close" disabled={sending}>✕</button>
        </div>

        {sent ? (
          <div className="gift-sent">
            <span className="gift-sent-art" aria-hidden="true">
              {choice && <ChoiceArt choice={choice} />}
            </span>
            <p><strong>Sent.</strong> It&apos;s waiting in {displayName}&apos;s gift drawer, for them to stick wherever they like.</p>
            <button type="button" className="gift-send" onClick={onClose}>Done</button>
          </div>
        ) : (
          <>
            <p className="gift-hint">It goes to their gift drawer with your note. They choose where it goes on their page.</p>

            {own.length > 0 && (
              <section>
                <h3>Your stickers</h3>
                <div className="gift-grid">
                  {own.map((s) => {
                    const c: Choice = { kind: "own", sticker: s };
                    return (
                      <button key={s.id} type="button" className="gift-cell" aria-pressed={isChosen(c)} onClick={() => setChoice(c)} title={s.name ?? "Your sticker"}>
                        <ChoiceArt choice={c} />
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {STICKER_PACKS.map((pack) => {
              const locked = pack.plus && !viewerIsPlus;
              return (
                <section key={pack.id}>
                  <h3>
                    {pack.label}
                    {pack.plus && <span className="gift-plus">{locked ? "Plus members can give these" : "Plus"}</span>}
                  </h3>
                  <div className="gift-grid">
                    {pack.stickers.map((def) => {
                      const c: Choice = { kind: "pack", key: def.key, label: def.label };
                      return (
                        <button
                          key={def.key}
                          type="button"
                          className="gift-cell"
                          aria-pressed={isChosen(c)}
                          disabled={locked}
                          onClick={() => setChoice(c)}
                          title={def.label}
                          aria-label={def.label}
                        >
                          <StickerArt def={def} />
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}

            <label className="gift-note">
              <span>A note (optional)</span>
              <textarea value={note} maxLength={140} rows={2} onChange={(e) => setNote(e.target.value)} placeholder="For your garden notes…" />
              <span className="gift-count">{note.length}/140</span>
            </label>

            {error && <p className="gift-error" role="alert">{error}</p>}

            <div className="gift-actions">
              <button type="button" className="gift-cancel" onClick={onClose} disabled={sending}>Cancel</button>
              <button type="button" className="gift-send" onClick={send} disabled={!choice || sending}>
                {sending ? "Sending…" : "Send sticker"}
              </button>
            </div>
          </>
        )}
      </div>
    </>,
    document.body,
  );
}

function ChoiceArt({ choice }: { choice: Choice }) {
  if (choice.kind === "own") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={choice.sticker.url} alt="" className={choice.sticker.outline ? "gift-own sticker-outline-img" : "gift-own"} />
    );
  }
  const def = STICKER_PACKS.flatMap((p) => p.stickers).find((s) => s.key === choice.key);
  return def ? <StickerArt def={def} /> : null;
}

function GiftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 12v9H4v-9" />
      <rect x="2" y="7" width="20" height="5" />
      <path d="M12 21V7" />
      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
    </svg>
  );
}
