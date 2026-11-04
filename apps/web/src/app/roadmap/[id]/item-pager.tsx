"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import s from "../roadmap.module.css";

// The direction of the last flip, read by the next card so it slides in from
// the right side. Lives for one navigation only.
const DIR_KEY = "inkwell-roadmap-flip";

function rememberDirection(dir: "next" | "prev") {
  try {
    sessionStorage.setItem(DIR_KEY, dir);
  } catch {
    // Private mode: no animation, nothing else lost.
  }
}

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
    !!target.closest("[role='dialog'], [contenteditable='true']")
  );
}

interface Neighbours {
  prevHref: string | null;
  nextHref: string | null;
}

function useFlip({ prevHref, nextHref }: Neighbours) {
  const router = useRouter();
  return (dir: "next" | "prev") => {
    const to = dir === "next" ? nextHref : prevHref;
    if (!to) return;
    rememberDirection(dir);
    router.push(to, { scroll: true });
  };
}

function Arrow({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {dir === "left" ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}
    </svg>
  );
}

/** The bar above the card: back to the roadmap, where you are, and the arrows. */
export function PagerBar({
  backHref,
  backLabel,
  position,
  prevHref,
  nextHref,
  prevTitle,
  nextTitle,
}: Neighbours & {
  backHref: string;
  backLabel: string;
  position: string | null;
  prevTitle: string | null;
  nextTitle: string | null;
}) {
  const router = useRouter();
  const flip = useFlip({ prevHref, nextHref });
  const flipRef = useRef(flip);
  flipRef.current = flip;

  useEffect(() => {
    if (prevHref) router.prefetch(prevHref);
    if (nextHref) router.prefetch(nextHref);
  }, [router, prevHref, nextHref]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (isTyping(e.target)) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        flipRef.current("next");
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        flipRef.current("prev");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <nav className={s.pagerBar} aria-label="Roadmap cards">
      <Link href={backHref} className={s.backLink}>
        <Arrow dir="left" />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{backLabel}</span>
      </Link>
      {(prevHref || nextHref) && (
        <span className={s.keyHint} aria-hidden="true">
          <kbd>←</kbd> <kbd>→</kbd> to flip
        </span>
      )}
      {position && <span className={s.position}>{position}</span>}
      {prevHref ? (
        <Link
          href={prevHref}
          className={s.navBtn}
          onClick={() => rememberDirection("prev")}
          aria-label={prevTitle ? `Previous: ${prevTitle}` : "Previous"}
          title={prevTitle ?? undefined}
        >
          <Arrow dir="left" />
        </Link>
      ) : (
        <span className={`${s.navBtn} ${s.navBtnOff}`} aria-hidden="true">
          <Arrow dir="left" />
        </span>
      )}
      {nextHref ? (
        <Link
          href={nextHref}
          className={s.navBtn}
          onClick={() => rememberDirection("next")}
          aria-label={nextTitle ? `Next: ${nextTitle}` : "Next"}
          title={nextTitle ?? undefined}
        >
          <Arrow dir="right" />
        </Link>
      ) : (
        <span className={`${s.navBtn} ${s.navBtnOff}`} aria-hidden="true">
          <Arrow dir="right" />
        </span>
      )}
    </nav>
  );
}

/** The card itself: slides in from the side you flipped toward, and turns on a sideways swipe. */
export function SwipeSheet({ prevHref, nextHref, children }: Neighbours & { children: ReactNode }) {
  const flip = useFlip({ prevHref, nextHref });
  const [enter, setEnter] = useState<"next" | "prev" | undefined>(undefined);
  const start = useRef<{ x: number; y: number; t: number } | null>(null);

  // Before paint, so the card doesn't show once and then jump.
  useLayoutEffect(() => {
    try {
      const dir = sessionStorage.getItem(DIR_KEY);
      sessionStorage.removeItem(DIR_KEY);
      if (dir === "next" || dir === "prev") setEnter(dir);
    } catch {
      // ignore
    }
  }, []);

  return (
    <article
      className={s.sheet}
      data-enter={enter}
      onAnimationEnd={() => setEnter(undefined)}
      onTouchStart={(e) => {
        if (e.touches.length !== 1 || isTyping(e.target)) {
          start.current = null;
          return;
        }
        const t = e.touches[0];
        start.current = { x: t.clientX, y: t.clientY, t: Date.now() };
      }}
      onTouchEnd={(e) => {
        const from = start.current;
        start.current = null;
        if (!from) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - from.x;
        const dy = t.clientY - from.y;
        if (Date.now() - from.t > 700) return;
        if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 2) return;
        if (window.getSelection()?.toString()) return;
        flip(dx < 0 ? "next" : "prev");
      }}
    >
      {children}
    </article>
  );
}

/** A neighbouring card, peeking out under this one. */
export function PeekLink({
  href,
  dir,
  label,
  title,
}: {
  href: string | null;
  dir: "next" | "prev";
  label: string;
  title: string | null;
}) {
  if (!href || !title) return <span className={`${s.peek} ${s.peekEmpty}`} aria-hidden="true" />;
  return (
    <Link
      href={href}
      className={`${s.peek} ${dir === "next" ? s.peekNext : ""}`}
      onClick={() => rememberDirection(dir)}
    >
      <div className={s.peekLabel}>{dir === "prev" ? `← ${label}` : `${label} →`}</div>
      <div className={s.peekTitle}>{title}</div>
    </Link>
  );
}
