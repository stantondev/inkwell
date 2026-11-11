"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AvatarWithFrame } from "@/components/avatar-with-frame";
import { LocalDate, SHORT_DATE } from "@/components/local-date";
import { EXCHANGE_NOTE_MAX, type ExchangeStatus } from "@/lib/pen-pal-exchange";

/** Two envelopes and the path a letter takes between them. */
function ExchangeMark({ arrived = false }: { arrived?: boolean }) {
  return (
    <svg className="ppx-mark" viewBox="0 0 132 56" width="132" height="56" aria-hidden="true">
      <path className="ppx-mark-path" d="M30 30 C 48 2, 84 2, 102 30" fill="none" strokeWidth="1.5" strokeDasharray="2 5" strokeLinecap="round" />
      <g className={arrived ? "ppx-mark-plane ppx-mark-plane-arrived" : "ppx-mark-plane"}>
        <path d="M0 0 L14 5 L0 10 L3 5 Z" />
      </g>
      {[6, 82].map((x) => (
        <g key={x} transform={`translate(${x} 24)`}>
          <rect className="ppx-mark-env" x="0" y="0" width="44" height="28" rx="3" />
          <path className="ppx-mark-flap" d="M1 2 L22 17 L43 2" fill="none" strokeWidth="1.5" strokeLinejoin="round" />
          <rect className="ppx-mark-stamp" x="32" y="4" width="8" height="9" rx="1" />
        </g>
      ))}
    </svg>
  );
}

/**
 * "Find me a pen pal": put your name in and Inkwell introduces you to one
 * other member who did the same. `variant="strip"` is the quiet one-line
 * form for a Letterbox that already has letters in it; it opens to the full
 * card when used or when there's something to tell.
 */
export function PenPalExchange({
  initial,
  variant = "card",
}: {
  initial?: ExchangeStatus | null;
  variant?: "card" | "strip";
}) {
  const [status, setStatus] = useState<ExchangeStatus | null>(initial ?? null);
  const [open, setOpen] = useState(variant === "card");
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState(initial?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justMatched, setJustMatched] = useState(false);
  const noteRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/pen-pal-exchange", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      if (json.data) setStatus(json.data);
    } catch {
      // offline: keep what we have
    }
  }, []);

  useEffect(() => {
    if (initial === undefined || initial === null) load();
  }, [initial, load]);

  // While your name is in, look again when you come back to the tab: the
  // introduction may have happened while you were away.
  useEffect(() => {
    if (status?.state !== "waiting") return;
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [status?.state, load]);

  async function join() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/pen-pal-exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note.trim() || null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Couldn't put your name in. Please try again.");
        if (json.code) load();
        return;
      }
      setStatus(json.data);
      setJustMatched(Boolean(json.matched));
      setAsking(false);
      setOpen(true);
    } catch {
      setError("Couldn't reach Inkwell. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/pen-pal-exchange", { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.data) setStatus(json.data);
      else setError("Couldn't take your name out. Please try again.");
    } catch {
      setError("Couldn't reach Inkwell. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  // Nothing to offer: still loading, or the exchange isn't open to this account.
  if (!status || (status.state === "idle" && status.reason === "unavailable")) return null;

  const intro = status.introduction;
  // Once both have written, the introduction has done its job; the card goes
  // back to offering the next one.
  const showIntro = status.state === "introduced" && intro && !(intro.written && intro.heard_back) ? intro : null;
  const idle = status.state !== "waiting" && !showIntro;

  if (variant === "strip" && idle && !open) {
    return (
      <div className="ppx-strip">
        <span className="ppx-strip-text">
          <strong>The pen pal exchange.</strong> Inkwell can introduce you to someone new to write to.
        </span>
        <button
          type="button"
          className="ppx-strip-btn"
          onClick={() => {
            setOpen(true);
            setAsking(true);
          }}
        >
          Find me a pen pal
        </button>
      </div>
    );
  }

  const form = (
    <form
      className="ppx-form"
      onSubmit={(e) => {
        e.preventDefault();
        join();
      }}
    >
      <label className="ppx-label" htmlFor="ppx-note">
        One line about you, for the person you meet <span>(optional)</span>
      </label>
      <div className="ppx-form-row">
        <input
          id="ppx-note"
          ref={noteRef}
          className="ppx-input"
          type="text"
          value={note}
          maxLength={EXCHANGE_NOTE_MAX}
          onChange={(e) => setNote(e.target.value)}
          placeholder="I write about night shifts, bad poetry and my allotment"
          autoComplete="off"
        />
        <button type="submit" className="ppx-btn" disabled={busy}>
          {busy ? "One moment…" : "Find me a pen pal"}
        </button>
      </div>
    </form>
  );

  return (
    <section className={`ppx-card${justMatched ? " ppx-card-new" : ""}`} aria-labelledby="ppx-title">
      <div className="ppx-airmail" aria-hidden="true" />
      <div className="ppx-body">
        <div className="ppx-head">
          <div>
            <p className="ppx-kicker">The pen pal exchange</p>
            <h2 id="ppx-title" className="ppx-title">
              {showIntro
                ? justMatched
                  ? `Meet ${showIntro.other_user.display_name}`
                  : `You and ${showIntro.other_user.display_name} have been introduced`
                : status.state === "waiting"
                  ? "Your name is in"
                  : "Find someone new to write to"}
            </h2>
          </div>
          <ExchangeMark arrived={Boolean(showIntro)} />
        </div>

        {showIntro ? (
          <>
            <div className="ppx-person">
              <AvatarWithFrame
                url={showIntro.other_user.avatar_url}
                name={showIntro.other_user.display_name}
                size={44}
                frame={showIntro.other_user.avatar_frame ?? null}
              />
              <div className="ppx-person-text">
                <Link href={`/${showIntro.other_user.username}`} className="ppx-person-name">
                  {showIntro.other_user.display_name}
                </Link>
                <span className="ppx-person-meta">
                  @{showIntro.other_user.username} · introduced{" "}
                  <LocalDate iso={showIntro.introduced_at} options={SHORT_DATE} />
                </span>
              </div>
            </div>
            <p className="ppx-text">
              {showIntro.heard_back
                ? `${showIntro.other_user.display_name} has written to you.`
                : showIntro.written
                  ? "Your letter is with them. There's no clock on a reply."
                  : justMatched
                    ? "They asked for a pen pal too. There's a sheet of paper between you now, and either of you can write first."
                    : "There's a sheet of paper between you, and either of you can write first."}
            </p>
            <div className="ppx-actions">
              <Link href={`/letters/${showIntro.conversation_id}`} className="ppx-btn">
                {showIntro.heard_back ? "Read their letter" : showIntro.written ? "Open your letters" : `Write to ${showIntro.other_user.display_name}`}
              </Link>
              {status.can_join && !asking && (
                <button type="button" className="ppx-link" onClick={() => setAsking(true)}>
                  Ask for another introduction
                </button>
              )}
            </div>
            {status.can_join && asking && form}
            {status.reason === "write_first" && (
              <p className="ppx-fine">
                You can ask for another introduction once you&rsquo;ve written to them, or after{" "}
                {status.rejoin_after_days} quiet days.
              </p>
            )}
          </>
        ) : status.state === "waiting" ? (
          <>
            <p className="ppx-text">
              You&rsquo;ll be introduced to the next person who asks. We&rsquo;ll tell you here and by email when it
              happens; until then there&rsquo;s nothing to do. With a community this size it can take a few days.
            </p>
            {status.note && <p className="ppx-quote">“{status.note}”</p>}
            <div className="ppx-actions">
              {status.waiting_since && (
                <span className="ppx-fine">
                  Waiting since <LocalDate iso={status.waiting_since} options={SHORT_DATE} />
                </span>
              )}
              <button type="button" className="ppx-link" onClick={leave} disabled={busy}>
                Take my name out
              </button>
            </div>
          </>
        ) : status.reason === "no_entry" ? (
          <>
            <p className="ppx-text">
              Put your name in and Inkwell introduces you to one other member who did the same. Publish your first
              entry and you can join: it gives your pen pal something to read.
            </p>
            <div className="ppx-actions">
              <Link href="/editor" className="ppx-btn">
                Write an entry
              </Link>
            </div>
          </>
        ) : status.reason === "write_first" ? (
          <p className="ppx-text">
            You can ask for another introduction once you&rsquo;ve written to the person you met, or after{" "}
            {status.rejoin_after_days} quiet days.
          </p>
        ) : (
          <>
            <p className="ppx-text">
              Put your name in and Inkwell introduces you to one other member who did the same. You get a sheet of
              paper between you, and either of you can write first. Letters are private, there are no reminders, and
              you can ask again whenever you like.
            </p>
            {form}
          </>
        )}

        {error && (
          <p className="ppx-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
