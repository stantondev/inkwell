"use client";

/**
 * StampPicker — send a writer a stamp.
 *
 * Opens a sheet of stamps (a FloatingPopup on desktop, a bottom sheet on
 * phones). Choosing one turns the card over: the stamp large on the left and
 * a line for the writer on the back, which only they will see. Sending
 * presses the stamp down and the new impression lands on the post.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FloatingPopup } from "./floating-popup";
import { StampArt } from "./stamp-art";
import {
  STAMP_CONFIG,
  STAMP_NOTE_MAX,
  STAMP_SHEETS,
  formatStampDay,
  resolveStampType,
  stampInfo,
  stampsInSheet,
  type StampMark,
} from "./stamp-config";
import { emitStampState, findPressedMark, useStampState } from "@/lib/stamp-state";
import { setStampSoundPreference, stampFeedback, stampSoundPreference } from "@/lib/stamp-sound";

interface StampPickerProps {
  entryId: string;
  currentStamp: string | null;
  isOwnEntry: boolean;
  isLoggedIn: boolean;
  isPlus: boolean;
  /** Compact mode for feed cards: an icon button. */
  compact?: boolean;
  /** Override the API path for stamping (e.g. for fediverse posts). */
  stampApiPath?: string;
  /** Where to read the viewer's own note (defaults from stampApiPath). */
  stampInfoPath?: string;
  /** The writer's name, for "A line for …". */
  writerName?: string | null;
  /** The viewer's note and day, when the page already has them. */
  currentNote?: string | null;
  currentStampedOn?: string | null;
  /** Marks currently on the post (to tell which one a send added). */
  currentMarks?: StampMark[] | null;
  onStampChange?: (stamps: string[], myStamp: string | null) => void;
}

const PRESS_MS = 560;

function StampOutlineIcon({ size = 16 }: { size?: number }) {
  // A perforated stamp outline (dashed edge = the perforations) with a little picture.
  return (
    <svg width={size} height={Math.round(size * 1.2)} viewBox="0 0 20 24" aria-hidden="true" className="stamp-trigger-icon">
      <rect x="1" y="1" width="18" height="22" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="1.6 2.1" />
      <rect x="4.5" y="4.5" width="11" height="15" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.75" />
      <path d="M7 15.5c1.2-2.4 2.4-3.4 3-3.4s1.6 1.4 3 3.4" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" opacity="0.75" />
      <circle cx="12.6" cy="8.6" r="1.3" fill="currentColor" opacity="0.75" />
    </svg>
  );
}

function errorText(status: number, body: { error?: string; code?: string } | null): string {
  if (body?.code === "retired") return "That stamp has been retired. Choose another from the sheet.";
  if (body?.code === "plus_required") return "Keepsakes are a Plus sheet.";
  if (body?.error) return body.error;
  if (status === 404) return "This page can't be stamped any more.";
  if (status === 403) return "You can't stamp this page.";
  if (status === 401) return "Sign in again to send a stamp.";
  return "The stamp didn't go through. Try again in a moment.";
}

export function StampPicker({
  entryId,
  currentStamp,
  isOwnEntry,
  isLoggedIn,
  isPlus,
  compact = false,
  stampApiPath,
  stampInfoPath,
  writerName,
  currentNote,
  currentStampedOn,
  currentMarks,
  onStampChange,
}: StampPickerProps) {
  const apiPath = stampApiPath ?? `/api/entries/${entryId}/stamp`;
  const infoPath = stampInfoPath ?? `${apiPath}s`;

  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [myStamp, setMyStamp] = useState<string | null>(currentStamp ? resolveStampType(currentStamp) : null);
  const [myNote, setMyNote] = useState<string | null>(currentNote ?? null);
  const [myDay, setMyDay] = useState<string | null>(currentStampedOn ?? null);
  const [infoLoaded, setInfoLoaded] = useState(currentNote !== undefined);
  const [step, setStep] = useState<"sheet" | "back">("sheet");
  const [chosen, setChosen] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [pressing, setPressing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plusHint, setPlusHint] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const marksRef = useRef<StampMark[]>(currentMarks ?? []);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMyStamp(currentStamp ? resolveStampType(currentStamp) : null);
  }, [currentStamp]);
  useEffect(() => {
    if (currentMarks) marksRef.current = currentMarks;
  }, [currentMarks]);

  useStampState(entryId, (patch) => {
    marksRef.current = patch.stamp_marks ?? marksRef.current;
    setMyStamp(patch.my_stamp ? resolveStampType(patch.my_stamp) : null);
    if (patch.my_note !== undefined) setMyNote(patch.my_note);
    if (patch.my_stamped_on !== undefined) setMyDay(patch.my_stamped_on);
  });

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Phone sheet: the page behind stays put and Escape closes it.
  const sheetOpen = open && isMobile;
  useEffect(() => {
    if (!sheetOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [sheetOpen]);

  // Focus the first useful thing once the panel is on screen.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      const el = panelRef.current?.querySelector<HTMLElement>(
        step === "back" ? "textarea" : "[data-stamp-choice]:not([aria-disabled='true'])"
      );
      el?.focus({ preventScroll: true });
    }, 60);
    return () => clearTimeout(t);
  }, [open, step]);

  const close = useCallback(() => {
    // Hand focus back to the button the picker came from.
    if (panelRef.current?.contains(document.activeElement)) buttonRef.current?.focus({ preventScroll: true });
    setOpen(false);
    setPressing(false);
    setPlusHint(false);
  }, []);

  const loadInfo = useCallback(async () => {
    try {
      const res = await fetch(infoPath);
      if (!res.ok) return;
      const { data } = await res.json();
      if (!data) return;
      if (Array.isArray(data.stamp_marks)) marksRef.current = data.stamp_marks;
      if (data.my_note !== undefined) {
        setMyNote(data.my_note ?? null);
        setNote((n) => (n === "" ? data.my_note ?? "" : n));
      }
      if (data.my_stamped_on !== undefined) setMyDay(data.my_stamped_on ?? null);
    } catch {
      // The picker works without it: only the note and date are missing.
    } finally {
      setInfoLoaded(true);
    }
  }, [infoPath]);

  if (isOwnEntry) return null;

  function handleOpen() {
    if (!isLoggedIn) {
      const next = window.location.pathname + window.location.search;
      window.location.href = `/login?next=${encodeURIComponent(next)}`;
      return;
    }
    if (open) {
      close();
      return;
    }
    setError(null);
    setPlusHint(false);
    setSoundOn(stampSoundPreference());
    if (myStamp) {
      setChosen(myStamp);
      setNote(myNote ?? "");
      setStep("back");
    } else {
      setChosen(null);
      setNote("");
      setStep("sheet");
    }
    setOpen(true);
    if (myStamp && !infoLoaded) loadInfo();
  }

  function choose(type: string) {
    const info = STAMP_CONFIG[type];
    if (info?.plusOnly && !isPlus) {
      setPlusHint(true);
      return;
    }
    setPlusHint(false);
    setError(null);
    setChosen(type);
    setStep("back");
  }

  async function send() {
    if (!chosen || busy) return;
    setBusy(true);
    setError(null);
    const trimmed = note.trim();
    try {
      const res = await fetch(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stamp_type: chosen, note: trimmed === "" ? null : trimmed }),
      });
      let body: { data?: Record<string, unknown>; error?: string; code?: string } | null = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      if (!res.ok || !body?.data) {
        setError(errorText(res.status, body));
        return;
      }
      const data = body.data as {
        stamp_type?: string;
        note?: string | null;
        stamps?: string[];
        stamp_marks?: StampMark[];
        stamp_count?: number;
        my_stamped_on?: string | null;
      };
      const type = resolveStampType(data.stamp_type ?? chosen);
      const marks = data.stamp_marks ?? [];
      const pressed = findPressedMark(marksRef.current, marks, type);
      const stampedOn =
        data.my_stamped_on ?? (myStamp ? myDay : marks.find((m) => m.id === pressed)?.stamped_on ?? null);
      marksRef.current = marks;

      stampFeedback();
      setPressing(true);
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setTimeout(
        () => {
          setMyStamp(type);
          setMyNote(data.note ?? (trimmed || null));
          setMyDay(stampedOn);
          emitStampState(entryId, {
            stamps: data.stamps ?? [],
            stamp_marks: marks,
            stamp_count: data.stamp_count ?? marks.length,
            my_stamp: type,
            my_note: data.note ?? (trimmed || null),
            my_stamped_on: stampedOn,
            pressed,
          });
          onStampChange?.(data.stamps ?? [], type);
          close();
        },
        reduce ? 0 : PRESS_MS
      );
    } catch {
      setError("The stamp didn't go through. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function takeBack() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(apiPath, { method: "DELETE" });
      let body: { data?: { stamps?: string[]; stamp_marks?: StampMark[]; stamp_count?: number }; error?: string } | null = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      if (!res.ok) {
        setError(errorText(res.status, body));
        return;
      }
      const marks = body?.data?.stamp_marks ?? [];
      marksRef.current = marks;
      setMyStamp(null);
      setMyNote(null);
      setMyDay(null);
      setNote("");
      emitStampState(entryId, {
        stamps: body?.data?.stamps ?? [],
        stamp_marks: marks,
        stamp_count: body?.data?.stamp_count ?? marks.length,
        my_stamp: null,
        my_note: null,
        my_stamped_on: null,
        pressed: null,
      });
      onStampChange?.(body?.data?.stamps ?? [], null);
      close();
    } catch {
      setError("Couldn't take it back just now. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    setStampSoundPreference(next);
    try {
      await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { stamp_sound: next } }),
      });
    } catch {
      // It still applies for this visit.
    }
  }

  const writer = writerName?.trim() || "the writer";
  const chosenInfo = chosen ? stampInfo(chosen) : null;
  const sameAsSent = !!myStamp && chosen === myStamp && note.trim() === (myNote ?? "").trim();

  const sheet = (
    <div className="stamp-sheet">
      <div className="stamp-sheet-head">
        <p className="stamp-sheet-title">{writerName ? `Send ${writer} a stamp` : "Send a stamp"}</p>
        {myStamp && (
          <button type="button" className="stamp-link" onClick={() => setStep("back")}>
            Back to your stamp
          </button>
        )}
      </div>
      {STAMP_SHEETS.map(({ sheet: s, title, blurb }) => {
        const types = stampsInSheet(s);
        if (types.length === 0) return null;
        const locked = s === "keepsake" && !isPlus;
        const issued = s === "issue" ? STAMP_CONFIG[types[0]]?.issued : null;
        return (
          <section key={s} className={`stamp-sheet-section${locked ? " is-locked" : ""}`}>
            <h3 className="stamp-sheet-section-title">
              {title}
              <span className="stamp-sheet-section-blurb">{issued ? `Issued ${issued}` : blurb}</span>
            </h3>
            <div className="stamp-sheet-grid">
              {types.map((t) => {
                const info = STAMP_CONFIG[t];
                const isMine = myStamp === t;
                return (
                  <button
                    key={t}
                    type="button"
                    data-stamp-choice
                    className={`stamp-choice${isMine ? " is-mine" : ""}`}
                    aria-label={`${info.label}: ${info.description}${locked ? " (Plus)" : ""}${isMine ? " (your stamp)" : ""}`}
                    aria-disabled={locked ? "true" : undefined}
                    onClick={() => choose(t)}
                  >
                    <StampArt type={t} width={isMobile ? 52 : 50} />
                    <span className="stamp-choice-label">{info.label}</span>
                  </button>
                );
              })}
            </div>
            {locked && (
              <p className={`stamp-sheet-note${plusHint ? " is-flagged" : ""}`}>
                Keepsakes are a Plus sheet.{" "}
                <a href="/settings/billing" className="stamp-link">
                  About Plus
                </a>
              </p>
            )}
          </section>
        );
      })}
    </div>
  );

  const back = chosen && chosenInfo && (
    <div className="stamp-postcard">
      <div className="stamp-postcard-stamp">
        <span className={`stamp-postcard-press${pressing ? " is-pressed" : ""}`}>
          <StampArt type={chosen} width={isMobile ? 84 : 92} />
        </span>
        <span className="stamp-postcard-name">{chosenInfo.label}</span>
        <span className="stamp-postcard-desc">{chosenInfo.description}</span>
      </div>
      <div className="stamp-postcard-back">
        {myStamp ? (
          <p className="stamp-postcard-sent">
            You sent {stampInfo(myStamp)?.label ?? "a stamp"}
            {myDay ? ` on ${formatStampDay(myDay)}` : ""}.
          </p>
        ) : null}
        <label className="stamp-postcard-label" htmlFor={`stamp-note-${entryId}`}>
          A line for {writer} <span>(only they&rsquo;ll see it)</span>
        </label>
        <textarea
          id={`stamp-note-${entryId}`}
          className="stamp-postcard-note"
          value={note}
          maxLength={STAMP_NOTE_MAX}
          rows={3}
          placeholder="Optional"
          onChange={(e) => setNote(e.target.value.replace(/\n/g, " "))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div className="stamp-postcard-meta">
          <span aria-live="polite">
            {note.length}/{STAMP_NOTE_MAX}
          </span>
          <button type="button" className="stamp-link" onClick={() => setStep("sheet")}>
            {myStamp ? "Choose a different stamp" : "Choose another"}
          </button>
        </div>
        {error && (
          <p className="stamp-postcard-error" role="alert">
            {error}
          </p>
        )}
        <div className="stamp-postcard-actions">
          <button type="button" className="stamp-send" onClick={send} disabled={busy || sameAsSent}>
            {busy ? "Sending…" : myStamp ? "Update" : "Send stamp"}
          </button>
          {myStamp && (
            <button type="button" className="stamp-link stamp-takeback" onClick={takeBack} disabled={busy}>
              Take it back
            </button>
          )}
        </div>
        <button type="button" className="stamp-sound-toggle" onClick={toggleSound} aria-pressed={soundOn}>
          {soundOn ? "♪ Sound on" : "♪ Sound off"}
        </button>
      </div>
    </div>
  );

  const panel = (
    <div ref={panelRef} className="stamp-picker-panel" role="dialog" aria-label={`Send ${writer} a stamp`}>
      {step === "back" && back ? back : sheet}
    </div>
  );

  const myInfo = myStamp ? stampInfo(myStamp) : null;
  const triggerLabel = myInfo ? `Your stamp: ${myInfo.label}. Change it or add a note.` : `Send ${writer} a stamp`;

  const trigger = compact ? (
    <button
      ref={buttonRef}
      type="button"
      onClick={handleOpen}
      className={`stamp-trigger${myStamp ? " is-stamped" : ""}`}
      aria-label={triggerLabel}
      aria-expanded={open}
      title={myInfo ? `You sent ${myInfo.label}` : "Send a stamp"}
    >
      {myStamp ? <StampArt type={myStamp} width={15} /> : <StampOutlineIcon size={15} />}
    </button>
  ) : (
    <button
      ref={buttonRef}
      type="button"
      onClick={handleOpen}
      className={`stamp-trigger-pill${myStamp ? " is-stamped" : ""}`}
      aria-label={triggerLabel}
      aria-expanded={open}
    >
      {myStamp ? <StampArt type={myStamp} width={16} /> : <StampOutlineIcon size={14} />}
      <span>{myInfo ? myInfo.label : "Send a stamp"}</span>
    </button>
  );

  return (
    <div className="stamp-picker">
      {trigger}
      {open &&
        (isMobile
          ? createPortal(
              <>
                <div className="comment-sheet-backdrop" onClick={close} />
                <div className="comment-sheet stamp-picker-sheet">
                  <div className="comment-sheet-handle" onClick={close}>
                    <div className="comment-sheet-handle-bar" />
                  </div>
                  {panel}
                </div>
              </>,
              document.body
            )
          : (
            <FloatingPopup
              anchorRef={buttonRef}
              open={open}
              onClose={close}
              placement={compact ? "top" : "bottom"}
              className="stamp-picker-popup rounded-xl border shadow-lg"
              style={{ background: "var(--surface)", borderColor: "var(--border)", width: "min(400px, calc(100vw - 24px))" }}
            >
              {panel}
            </FloatingPopup>
          ))}
    </div>
  );
}
