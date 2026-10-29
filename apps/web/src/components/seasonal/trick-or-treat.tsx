"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FloatingPopup } from "@/components/floating-popup";
import { HALLOWEEN_PROMPTS } from "@/lib/halloween-prompts";
import { SEASON_COOKIE } from "@/lib/seasons";
import { trackFeature } from "@/lib/usage";
import { useSeason } from "./season-context";
import { playTrick, type TrickKind } from "./halloween-atmosphere";
import { Pumpkin } from "./pumpkin";

const HINT_KEY = "inkwell-season-hint:halloween-2026";

const TRICKS: { kind: TrickKind; line: string }[] = [
  { kind: "swarm", line: "Bats in the belfry!" },
  { kind: "ghost", line: "Boo! Sorry. Couldn't help it." },
  { kind: "possess", line: "Something has got into the ink…" },
  { kind: "lights", line: "Who blew out the candles?" },
];

/**
 * The trick-or-treat pumpkin: in the sidebar beside the logo, in the phone's
 * top bar, and in the signed-out header. Treat = a seasonal writing prompt
 * (opens the editor with it); trick = something silly happens to the page.
 * Shows once, the first time someone visits during the season, a small note
 * saying it's there.
 */
export function TrickOrTreat({ signedIn, className = "" }: { signedIn: boolean; className?: string }) {
  const season = useSeason();
  if (season !== "halloween") return null;
  return <TrickOrTreatButton signedIn={signedIn} className={className} />;
}

type View = { kind: "ask" } | { kind: "treat"; n: number };

function TrickOrTreatButton({ signedIn, className }: { signedIn: boolean; className: string }) {
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState(false);
  const [view, setView] = useState<View>({ kind: "ask" });
  const [bounce, setBounce] = useState(0);
  const lastTreat = useRef<number>(-1);

  // The one-time "there's a pumpkin here" note, on whichever copy is on screen.
  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(HINT_KEY) === "1";
    } catch {
      seen = true;
    }
    if (seen) return;
    const show = setTimeout(() => {
      const el = btn.current;
      if (!el || el.getClientRects().length === 0) return;
      setHint(true);
      try {
        localStorage.setItem(HINT_KEY, "1");
      } catch {
        /* fine: it just shows again next time */
      }
    }, 2200);
    return () => clearTimeout(show);
  }, []);

  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(false), 10000);
    return () => clearTimeout(t);
  }, [hint]);

  const pickTreat = () => {
    let n = Math.floor(Math.random() * HALLOWEEN_PROMPTS.length);
    if (n === lastTreat.current) n = (n + 1) % HALLOWEEN_PROMPTS.length;
    lastTreat.current = n;
    return n;
  };

  const treat = () => {
    setView({ kind: "treat", n: pickTreat() });
    trackFeature("trick_or_treat", "treat");
  };

  const trick = () => {
    const t = TRICKS[Math.floor(Math.random() * TRICKS.length)];
    setOpen(false);
    setView({ kind: "ask" });
    trackFeature("trick_or_treat", "trick");
    // Let the popup close before the page misbehaves.
    setTimeout(() => playTrick(t.kind, t.line), 120);
  };

  const toggle = () => {
    setHint(false);
    setBounce((b) => b + 1);
    setView({ kind: "ask" });
    setOpen((o) => !o);
  };

  const turnOff = async () => {
    document.cookie = `${SEASON_COOKIE}=off; path=/; max-age=${60 * 60 * 24 * 60}; samesite=lax`;
    if (signedIn) {
      try {
        await fetch("/api/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ settings: { seasonal_decorations: false } }),
        });
      } catch {
        /* the cookie still turns them off in this browser */
      }
    }
    window.location.reload();
  };

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`tot-button ${className}`}
        onClick={toggle}
        aria-label="Trick or treat?"
        aria-expanded={open}
        title="Trick or treat?"
      >
        <span key={bounce} className={bounce ? "tot-bounce" : undefined}>
          <Pumpkin />
        </span>
      </button>

      <FloatingPopup anchorRef={btn} open={hint && !open} onClose={() => setHint(false)} placement="bottom" className="tot-hint">
        <button type="button" className="tot-hint-inner" onClick={toggle}>
          <strong>Happy Hallowe&rsquo;en from Inkwell!</strong>
          <span>Knock on the pumpkin for a trick or a treat.</span>
        </button>
      </FloatingPopup>

      <FloatingPopup anchorRef={btn} open={open} onClose={() => setOpen(false)} placement="bottom" className="tot-popup">
        <div role="dialog" aria-label="Trick or treat">
          {view.kind === "ask" ? (
            <div className="tot-ask">
              <div className="tot-ask-head">
                <Pumpkin size={44} />
                <div>
                  <p className="tot-title">Trick or treat?</p>
                  <p className="tot-sub">Knock, knock. Someone&rsquo;s home.</p>
                </div>
              </div>
              <div className="tot-choices">
                <button type="button" className="tot-choice tot-choice-trick" onClick={trick}>
                  Trick
                  <small>something spooky</small>
                </button>
                <button type="button" className="tot-choice tot-choice-treat" onClick={treat}>
                  Treat
                  <small>a writing prompt</small>
                </button>
              </div>
            </div>
          ) : (
            <TreatCard
              n={view.n}
              signedIn={signedIn}
              onAnother={treat}
              onGo={() => setOpen(false)}
            />
          )}
          <button type="button" className="tot-off" onClick={turnOff}>
            Turn off seasonal decorations
          </button>
        </div>
      </FloatingPopup>
    </>
  );
}

function TreatCard({ n, signedIn, onAnother, onGo }: { n: number; signedIn: boolean; onAnother: () => void; onGo: () => void }) {
  const p = HALLOWEEN_PROMPTS[n];
  return (
    <div className="tot-treat">
      <p className="tot-treat-label">Your treat</p>
      <div className="tot-wrapper">
        <p className="tot-treat-title">{p.title}</p>
        <p className="tot-treat-body">{p.body}</p>
      </div>
      <div className="tot-treat-actions">
        {signedIn ? (
          <Link href={`/editor?prompt=halloween&n=${n}`} className="tot-write" onClick={onGo}>
            Write about this
          </Link>
        ) : (
          <Link href="/get-started" className="tot-write" onClick={onGo}>
            Join Inkwell to write it
          </Link>
        )}
        <button type="button" className="tot-another" onClick={onAnother}>
          Another treat
        </button>
      </div>
    </div>
  );
}
