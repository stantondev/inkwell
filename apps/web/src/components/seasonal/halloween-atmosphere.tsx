"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useSeason } from "./season-context";
import { GHOST_D } from "./halloween-art";
import { Bat } from "./bat";

/** Fired by the trick-or-treat pumpkin. */
export const TRICK_EVENT = "inkwell-halloween-trick";
export type TrickKind = "swarm" | "ghost" | "possess" | "lights";

interface TrickDetail {
  kind: TrickKind;
  line: string;
}

export function playTrick(kind: TrickKind, line: string) {
  window.dispatchEvent(new CustomEvent<TrickDetail>(TRICK_EVENT, { detail: { kind, line } }));
}

interface Bat {
  id: number;
  top: number; // vh
  duration: number; // s
  delay: number; // s
  size: number; // px
  rtl: boolean;
  bob: number; // px
}

let nextId = 1;

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Pages where nothing should drift past: writing and reading letters.
function quietPage(path: string): boolean {
  return path.startsWith("/editor") || /^\/letters\/[^/]+/.test(path) || path.startsWith("/arrange") || path.startsWith("/stamp-album");
}

function flock(count: number, opts: { fast?: boolean } = {}): Bat[] {
  const rtl = Math.random() < 0.5;
  const top = 6 + Math.random() * 30;
  return Array.from({ length: count }, (_, i) => ({
    id: nextId++,
    top: top + (Math.random() - 0.5) * (opts.fast ? 50 : 10),
    duration: opts.fast ? 2.6 + Math.random() * 1.6 : 9 + Math.random() * 5,
    delay: opts.fast ? Math.random() * 1.2 : i * (0.5 + Math.random() * 0.9),
    size: opts.fast ? 32 + Math.random() * 30 : 26 + Math.random() * 16,
    rtl: opts.fast ? Math.random() < 0.5 : rtl,
    bob: 8 + Math.random() * 22,
  }));
}

/**
 * Halloween in the margins: now and then a few bats cross the top of the
 * page, a spider hangs from the corner, cobwebs gather in the window's
 * corners, and the pumpkin's tricks play out here. Nothing here takes a
 * click except the spider; nothing moves with reduced motion.
 */
export function HalloweenAtmosphere() {
  const season = useSeason();
  if (season !== "halloween") return null;
  return <Atmosphere />;
}

function Atmosphere() {
  const pathname = usePathname() || "/";
  const quiet = quietPage(pathname);
  const [bats, setBats] = useState<Bat[]>([]);
  const [ghost, setGhost] = useState<number | null>(null);
  const [caption, setCaption] = useState<{ id: number; line: string } | null>(null);
  const [lights, setLights] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const launch = useCallback((list: Bat[]) => {
    setBats((b) => [...b, ...list]);
    const longest = Math.max(...list.map((x) => x.duration + x.delay));
    const ids = new Set(list.map((x) => x.id));
    setTimeout(() => setBats((b) => b.filter((x) => !ids.has(x.id))), (longest + 0.5) * 1000);
  }, []);

  // The occasional flight.
  useEffect(() => {
    if (quiet || reducedMotion()) return;
    const schedule = (wait: number) => {
      timer.current = setTimeout(() => {
        if (document.visibilityState === "visible") launch(flock(1 + Math.floor(Math.random() * 3)));
        schedule(40000 + Math.random() * 50000);
      }, wait);
    };
    schedule(3500 + Math.random() * 4000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [quiet, launch]);

  // Tricks from the pumpkin.
  useEffect(() => {
    const onTrick = (e: Event) => {
      const { kind, line } = (e as CustomEvent<TrickDetail>).detail;
      const still = reducedMotion();
      const id = Date.now();
      setCaption({ id, line });
      setTimeout(() => setCaption((c) => (c && c.id === id ? null : c)), 3600);
      if (kind === "swarm") {
        if (!still) launch(flock(18, { fast: true }));
      } else if (kind === "ghost") {
        setGhost(id);
        setTimeout(() => setGhost(null), still ? 2200 : 3400);
      } else if (kind === "possess") {
        if (still) return;
        document.body.classList.add("season-possessed");
        setTimeout(() => document.body.classList.remove("season-possessed"), 1700);
      } else if (kind === "lights") {
        setLights(true);
        setTimeout(() => setLights(false), 4200);
      }
    };
    window.addEventListener(TRICK_EVENT, onTrick);
    return () => window.removeEventListener(TRICK_EVENT, onTrick);
  }, [launch]);

  return (
    <div className="season-layer" aria-hidden="true">
      <Cobweb className="season-cobweb season-cobweb-right" />
      {!quiet && <Spider />}

      {bats.map((b) => (
        <span
          key={b.id}
          className={`season-bat${b.rtl ? " season-bat-rtl" : ""}`}
          style={
            {
              top: `${b.top}vh`,
              "--bat-size": `${b.size}px`,
              "--bat-bob": `${b.bob}px`,
              animationDuration: `${b.duration}s`,
              animationDelay: `${b.delay}s`,
            } as React.CSSProperties
          }
        >
          <span className="season-bat-bob" style={{ animationDelay: `${b.delay}s` }}>
            <Bat className="season-bat-svg" flap={0.16 + (b.id % 5) * 0.015} />
          </span>
        </span>
      ))}

      {lights && <Flashlight />}

      {caption && (
        <div key={caption.id} className="season-caption" role="status">
          {caption.line}
        </div>
      )}

      {ghost && (
        <div key={ghost} className="season-ghost">
          <svg viewBox="0 0 60 72" className="season-ghost-svg">
            <path d={GHOST_D} className="season-ghost-sheet" />
            <ellipse cx="22" cy="28" rx="4" ry="6" className="season-ghost-eye" />
            <ellipse cx="38" cy="28" rx="4" ry="6" className="season-ghost-eye" />
            <ellipse cx="30" cy="44" rx="6" ry="7.5" className="season-ghost-eye" />
          </svg>
          <span className="season-ghost-boo">Boo!</span>
        </div>
      )}
    </div>
  );
}

/** Lights out: the page goes dark except a candle's circle around the pointer. */
function Flashlight() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--mx", `${window.innerWidth / 2}px`);
    el.style.setProperty("--my", `${window.innerHeight / 2}px`);
    const move = (e: PointerEvent) => {
      el.style.setProperty("--mx", `${e.clientX}px`);
      el.style.setProperty("--my", `${e.clientY}px`);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerdown", move);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", move);
    };
  }, []);
  return <div ref={ref} className="season-flashlight" />;
}

function Spider() {
  const [up, setUp] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  // It never takes a click (it hangs over the page's own buttons): it just
  // scurries up its thread when the pointer comes near, and drops back later.
  useEffect(() => {
    if (up) {
      const t = setTimeout(() => setUp(false), 9000);
      return () => clearTimeout(t);
    }
    let frame = 0;
    const near = (e: PointerEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const r = ref.current?.querySelector("svg")?.getBoundingClientRect();
        if (!r || r.width === 0) return;
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        if (dx * dx + dy * dy < 60 * 60) setUp(true);
      });
    };
    window.addEventListener("pointermove", near);
    return () => {
      window.removeEventListener("pointermove", near);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [up]);
  return (
    <span ref={ref} className={`season-spider${up ? " season-spider-up" : ""}`}>
      <span className="season-spider-inner">
        <span className="season-spider-thread" />
        <svg viewBox="-40 -30 80 64" className="season-spider-svg">
          <path
            className="season-spider-legs"
            d="M-8 -5L-22 -20L-32 -10M-9 0L-28 -6L-37 6M-8 5L-24 12L-30 26M8 -5L22 -20L32 -10M9 0L28 -6L37 6M8 5L24 12L30 26"
          />
          <ellipse cx="0" cy="-12" rx="7" ry="6" className="season-spider-body" />
          <ellipse cx="0" cy="4" rx="11" ry="13" className="season-spider-body" />
          <circle cx="-3" cy="-13" r="1.8" className="season-spider-eye" />
          <circle cx="3" cy="-13" r="1.8" className="season-spider-eye" />
          <path d="M-4 0L4 0M0 -4L0 10" className="season-spider-mark" />
        </svg>
      </span>
    </span>
  );
}

/** A corner cobweb, anchored at its top-right corner. */
function Cobweb({ className }: { className: string }) {
  // Radial threads from the corner, then sagging rings between them.
  const angles = [90, 112, 135, 158, 180];
  const rad = (d: number) => (d * Math.PI) / 180;
  const R = 120;
  const spokes = angles.map((a) => `M120 0L${(120 + R * Math.cos(rad(a))).toFixed(1)} ${(R * Math.sin(rad(a))).toFixed(1)}`).join("");
  const rings = [30, 54, 80, 104]
    .map((r) => {
      let d = "";
      angles.forEach((a, i) => {
        const x = 120 + r * Math.cos(rad(a));
        const y = r * Math.sin(rad(a));
        if (i === 0) {
          d += `M${x.toFixed(1)} ${y.toFixed(1)}`;
        } else {
          const mid = rad((a + angles[i - 1]) / 2);
          const sag = r * 0.82;
          d += `Q${(120 + sag * Math.cos(mid)).toFixed(1)} ${(sag * Math.sin(mid)).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
        }
      });
      return d;
    })
    .join("");
  return (
    <svg viewBox="0 0 120 120" className={className}>
      <path d={spokes + rings} />
    </svg>
  );
}
