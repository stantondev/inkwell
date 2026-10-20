"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DeadLetter } from "@/lib/dead-letter/letters";
import {
  SNAP_DISTANCE,
  clipPathOf,
  scatterToSlots,
  settles,
  tearSheet,
  type Piece,
  type PiecePose,
  type Pt,
} from "@/lib/dead-letter/tear";
import { buzz, paperLift, paperSettle } from "@/lib/dead-letter/sound";
import { RULES, type Level, type LevelRules } from "@/lib/dead-letter/difficulty";
import { FixedSheet, SHEET_H, SHEET_W } from "./letter-sheet";
import styles from "./play.module.css";

interface Layout {
  deskW: number;
  deskH: number;
  scale: number;
  frameLeft: number;
  frameTop: number;
  wide: boolean;
  /** Pieces waiting in the tray are drawn this much smaller (phones). */
  trayScale: number;
  /** Where the tray starts, in desk pixels (phones). */
  trayTop: number;
}

function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

function measure(deskW: number, viewH: number, rules: LevelRules): Layout {
  if (deskW >= 860) {
    const scale = Math.max(0.5, Math.min(0.82, (viewH - 300) / SHEET_H, (deskW - 640) / SHEET_W));
    const sheetW = SHEET_W * scale;
    const deskH = Math.round(SHEET_H * scale + 96);
    // Many small pieces wait beside the sheet drawn a little smaller, so two columns fit each side.
    const many = rules.pieces.rows * rules.pieces.cols > 6;
    return { deskW, deskH, scale, frameLeft: (deskW - sheetW) / 2, frameTop: 48, wide: true, trayScale: many ? 0.72 : 1, trayTop: 0 };
  }
  // Phones: the sheet on top, a tray of smaller pieces underneath it.
  const n = rules.pieces.rows * rules.pieces.cols;
  const trayRows = Math.ceil(n / trayCols(n));
  const trayScale = n > 6 ? 0.56 : 0.62;
  const budget = viewH - 380 - trayRows * 70;
  const scale = Math.min(0.62, (deskW - 28) / SHEET_W, Math.max(0.32, budget / SHEET_H));
  const sheetW = SHEET_W * scale;
  const sheetH = SHEET_H * scale;
  const rowH = (SHEET_H / rules.pieces.rows) * scale * trayScale + 22;
  const frameTop = 12;
  const trayTop = frameTop + sheetH + 14;
  return {
    deskW,
    deskH: Math.round(trayTop + rowH * trayRows + 10),
    scale,
    frameLeft: (deskW - sheetW) / 2,
    frameTop,
    wide: false,
    trayScale,
    trayTop,
  };
}

/** Columns in the phone tray: two for a few big pieces, three otherwise. */
function trayCols(n: number) {
  return n <= 4 ? 2 : 3;
}

/** Where the pieces start: beside the sheet on a wide desk, in a tray under it on a phone. */
function startPoses(pieces: Piece[], layout: Layout, seed: number, rules: LevelRules): PiecePose[] {
  const { scale, deskW, deskH, frameLeft, frameTop } = layout;
  const n = pieces.length;
  const slots: Pt[] = [];
  if (layout.wide) {
    // Half the pieces each side of the sheet; two columns a side when there are many.
    const side = (deskW - frameLeft) / scale - SHEET_W;
    const perSide = [Math.ceil(n / 2), Math.floor(n / 2)];
    perSide.forEach((k, s) => {
      const cols = k > 3 ? 2 : 1;
      const rows = Math.ceil(k / cols);
      for (let i = 0; i < k; i++) {
        const c = i % cols;
        const r = Math.floor(i / cols);
        // Keep a margin from the desk's outer edge.
        const x = side * 0.06 + (side * 0.88 * (c + 0.5)) / cols;
        slots.push({ x: s === 0 ? -side + x : SHEET_W + x, y: (SHEET_H * (r + 0.5)) / rows });
      }
    });
    return scatterToSlots(pieces, slots, seed, { turns: rules.turns, jitter: { x: Math.max(8, side * 0.05), y: 20 } });
  }
  const cols = trayCols(n);
  const rows = Math.ceil(n / cols);
  const rowH = (deskH - layout.trayTop - 10) / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const sx = (deskW / cols) * (c + 0.5);
      const sy = layout.trayTop + rowH * (r + 0.5);
      slots.push({ x: (sx - frameLeft) / scale, y: (sy - frameTop) / scale });
    }
  }
  return scatterToSlots(pieces, slots, seed, { turns: rules.turns, jitter: { x: 6, y: 4 } });
}

function transformOf(pose: PiecePose, opts: { lifted?: boolean; placed?: boolean; tray?: number } = {}) {
  let tilt = pose.tilt;
  if (opts.placed) tilt = 0;
  else if (opts.lifted && ((pose.turns % 4) + 4) % 4 === 0) {
    // Straighten as it nears home, like a hand lining it up.
    const d = Math.hypot(pose.x, pose.y);
    tilt = tilt * Math.min(1, d / (SNAP_DISTANCE * 4));
  }
  const size = opts.lifted ? 1.035 : !opts.placed && opts.tray && opts.tray !== 1 ? opts.tray : 1;
  return `translate(${pose.x.toFixed(1)}px, ${pose.y.toFixed(1)}px) rotate(${pose.turns * 90 + tilt}deg)${size !== 1 ? ` scale(${size})` : ""}`;
}

export function MendDesk({
  letter,
  level,
  onMended,
  onHint,
}: {
  letter: DeadLetter;
  level: Level;
  onMended: (byClerk: boolean) => void;
  onHint: () => void;
}) {
  const rules = RULES[level];
  const seed = useMemo(() => seedOf(letter.id), [letter.id]);
  const pieces = useMemo(
    () => tearSheet(SHEET_W, SHEET_H, { rows: rules.pieces.rows, cols: rules.pieces.cols, seed }),
    [seed, rules.pieces.rows, rules.pieces.cols],
  );

  // Letters run to different lengths: find the largest hand that fills the sheet
  // without running off the bottom, measured once on a hidden copy.
  const [fontSize, setFontSize] = useState<number | null>(null);
  const measureRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const fit = () => {
      let size = 21;
      el.style.fontSize = `${size}px`;
      while (size > 13 && el.scrollHeight > SHEET_H - 18) {
        size -= 0.5;
        el.style.fontSize = `${size}px`;
      }
      setFontSize(size);
    };
    // Measure in the real hand, not the fallback it shows while loading.
    (document.fonts?.ready ?? Promise.resolve()).then(fit, fit);
  }, []);
  const sheet = useMemo(() => (fontSize ? <FixedSheet letter={letter} level={level} fontSize={fontSize} /> : null), [letter, level, fontSize]);
  const [hintPiece, setHintPiece] = useState<number | null>(null);

  const deskRef = useRef<HTMLDivElement>(null);
  const pieceRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [layout, setLayout] = useState<Layout | null>(null);
  // The pieces start where the first measurement of the desk put them; `moved` is everything since.
  const [firstLayout, setFirstLayout] = useState<Layout | null>(null);
  const start = useMemo(
    () => (firstLayout ? startPoses(pieces, firstLayout, seed, rules) : null),
    [firstLayout, pieces, seed, rules],
  );
  const [moved, setMoved] = useState<PiecePose[] | null>(null);
  const poses = moved ?? start;
  const setPoses = useCallback(
    (fn: (prev: PiecePose[]) => PiecePose[]) => setMoved((prev) => {
      const base = prev ?? start;
      return base ? fn(base) : prev;
    }),
    [start],
  );
  const [placed, setPlaced] = useState<boolean[]>(() => pieces.map(() => false));
  const [order, setOrder] = useState<number[]>(() => pieces.map((p) => p.id));
  const [lifted, setLifted] = useState<number | null>(null);
  const [done, setDone] = useState<null | "self" | "clerk">(null);

  // Measure the desk; scatter once we know its size.
  useLayoutEffect(() => {
    const el = deskRef.current;
    if (!el) return;
    const update = () => {
      const next = measure(el.clientWidth, window.innerHeight, rules);
      setLayout((prev) =>
        prev && prev.deskW === next.deskW && prev.deskH === next.deskH && prev.scale === next.scale ? prev : next,
      );
      setFirstLayout((prev) => prev ?? next);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rules]);

  const snapDistance = (layout ? Math.max(SNAP_DISTANCE, 22 / layout.scale) : SNAP_DISTANCE) * rules.snap;
  const placedCount = placed.filter(Boolean).length;

  const finish = useCallback(
    (by: "self" | "clerk") => {
      setDone(by);
      window.setTimeout(() => onMended(by === "clerk"), by === "clerk" ? 2300 : 1700);
    },
    [onMended],
  );

  useEffect(() => {
    if (!done && placedCount === pieces.length) {
      const t = window.setTimeout(() => finish("self"), 380);
      return () => window.clearTimeout(t);
    }
  }, [placedCount, pieces.length, done, finish]);

  /** Keep a piece's middle on the desk. */
  const clampToDesk = useCallback(
    (i: number, pose: PiecePose): PiecePose => {
      if (!layout) return pose;
      const c = pieces[i].centroid;
      const minX = -layout.frameLeft / layout.scale + 40;
      const maxX = (layout.deskW - layout.frameLeft) / layout.scale - 40;
      const minY = -layout.frameTop / layout.scale + 40;
      const maxY = (layout.deskH - layout.frameTop) / layout.scale - 40;
      const cx = Math.min(maxX, Math.max(minX, c.x + pose.x));
      const cy = Math.min(maxY, Math.max(minY, c.y + pose.y));
      return { ...pose, x: cx - c.x, y: cy - c.y };
    },
    [layout, pieces],
  );

  const commit = useCallback(
    (i: number, pose: PiecePose) => {
      if (settles(pose, snapDistance)) {
        const home: PiecePose = { x: 0, y: 0, turns: Math.round(pose.turns / 4) * 4, tilt: 0 };
        setPoses((prev) => prev.map((p, j) => (j === i ? home : p)));
        setPlaced((prev) => prev.map((v, j) => (j === i ? true : v)));
        setOrder((prev) => [i, ...prev.filter((id) => id !== i)]);
        setHintPiece((h) => (h === i ? null : h));
        paperSettle();
        buzz(14);
        return;
      }
      const clamped = clampToDesk(i, pose);
      setPoses((prev) => prev.map((p, j) => (j === i ? clamped : p)));
    },
    [snapDistance, clampToDesk, setPoses],
  );

  const raise = (i: number) => setOrder((prev) => [...prev.filter((id) => id !== i), i]);

  const drag = useRef<{
    i: number;
    id: number;
    sx: number;
    sy: number;
    start: PiecePose;
    pose: PiecePose;
    moved: number;
    at: number;
  } | null>(null);

  const onPointerDown = (i: number) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (!poses || !layout || placed[i] || done || drag.current) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events have no pointer to capture */
    }
    drag.current = { i, id: e.pointerId, sx: e.clientX, sy: e.clientY, start: poses[i], pose: poses[i], moved: 0, at: e.timeStamp };
    raise(i);
    setLifted(i);
    paperLift();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || !layout) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    d.moved = Math.max(d.moved, Math.hypot(dx, dy));
    d.pose = { ...d.start, x: d.start.x + dx / layout.scale, y: d.start.y + dy / layout.scale };
    const el = pieceRefs.current[d.i];
    if (el) el.style.transform = transformOf(d.pose, { lifted: true });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    setLifted(null);
    if (e.type === "pointercancel") {
      commit(d.i, d.start);
      return;
    }
    if (d.moved < 6 && e.timeStamp - d.at < 500) {
      // A tap turns the piece a quarter.
      commit(d.i, { ...d.start, turns: d.start.turns + 1 });
      return;
    }
    commit(d.i, d.pose);
  };

  const onKeyDown = (i: number) => (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!poses || placed[i] || done) return;
    const step = e.shiftKey ? 40 : 12;
    const p = poses[i];
    const moves: Record<string, Partial<PiecePose>> = {
      ArrowLeft: { x: p.x - step },
      ArrowRight: { x: p.x + step },
      ArrowUp: { y: p.y - step },
      ArrowDown: { y: p.y + step },
      r: { turns: p.turns + 1 },
      R: { turns: p.turns + 1 },
      " ": { turns: p.turns + 1 },
    };
    const m = moves[e.key];
    if (!m) return;
    e.preventDefault();
    raise(i);
    commit(i, { ...p, ...m });
  };

  /** Turn one loose piece the right way up and show where it goes. */
  const giveHint = () => {
    if (!poses || done) return;
    const i = pieces.findIndex((_, j) => !placed[j]);
    if (i < 0) return;
    setPoses((prev) => prev.map((p, j) => (j === i ? { ...p, turns: Math.ceil(p.turns / 4) * 4, tilt: 0 } : p)));
    raise(i);
    setHintPiece(i);
    paperLift();
    onHint();
  };

  const letClerkMend = () => {
    if (!poses || done) return;
    setPoses((prev) => prev.map((p) => ({ x: 0, y: 0, turns: Math.round(p.turns / 4) * 4, tilt: 0 })));
    setPlaced(pieces.map(() => true));
    setHintPiece(null);
    paperSettle();
    finish("clerk");
  };

  return (
    <section className={styles.mend} aria-label="Mend the letter">
      <div className={styles.mendBar}>
        {done ? (
          <p className={styles.mendDone} role="status">
            {done === "clerk" ? "The clerk pieces it together and presses it flat." : "Mended. You press it flat under a book."}
          </p>
        ) : (
          <>
            <p className={styles.hint}>
              Drag the pieces together.{rules.turns !== "none" && <strong> Tap one to turn it.</strong>}
              <span className={styles.count} aria-live="polite">
                {placedCount} of {pieces.length} in place
              </span>
            </p>
            <div className={styles.barTools}>
              <button type="button" className={styles.hintButton} onClick={giveHint}>
                <span aria-hidden="true">💡</span> Show me one
              </button>
              <button type="button" className={styles.quietButton} onClick={letClerkMend}>
                Let the clerk do it
              </button>
            </div>
          </>
        )}
      </div>
      {fontSize === null && (
        <div className={styles.measure} aria-hidden="true">
          <FixedSheet letter={letter} level={level} fontSize={21} measureRef={measureRef} />
        </div>
      )}
      <div ref={deskRef} className={styles.desk} style={{ height: layout?.deskH ?? 640 }}>
        {layout && (
          <div
            className={styles.frame}
            style={{ left: layout.frameLeft, top: layout.frameTop, width: SHEET_W * layout.scale, height: SHEET_H * layout.scale }}
          >
            <div className={styles.frameInner} style={{ transform: `scale(${layout.scale})` }}>
              <div className={styles.homeOutline} aria-hidden="true" />
              {hintPiece !== null && !placed[hintPiece] && (
                <svg className={styles.ghost} width={SHEET_W} height={SHEET_H} viewBox={`0 0 ${SHEET_W} ${SHEET_H}`} aria-hidden="true">
                  <polygon points={pieces[hintPiece].polygon.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")} />
                </svg>
              )}
              {poses &&
                sheet &&
                pieces.map((piece, i) => {
                  const isPlaced = placed[i];
                  return (
                    <div
                      key={piece.id}
                      ref={(el) => {
                        pieceRefs.current[i] = el;
                      }}
                      className={`${styles.piece} ${isPlaced ? styles.piecePlaced : ""} ${lifted === i ? styles.pieceLifted : ""} ${hintPiece === i && !isPlaced ? styles.pieceHinted : ""}`}
                      style={{
                        // Stacking by z-index, not DOM order: moving a node mid-drag drops its pointer capture.
                        zIndex: lifted === i ? 50 : order.indexOf(i) + 1,
                        transformOrigin: `${piece.centroid.x}px ${piece.centroid.y}px`,
                        transform: transformOf(poses[i], { placed: isPlaced, lifted: lifted === i, tray: layout.trayScale }),
                        transitionDelay: done === "clerk" ? `${order.indexOf(i) * 90}ms` : undefined,
                      }}
                    >
                      <div
                        className={styles.pieceCut}
                        style={{ clipPath: clipPathOf(piece) }}
                        role="button"
                        tabIndex={isPlaced || done ? -1 : 0}
                        aria-label={`Torn piece ${piece.id + 1}${isPlaced ? ", in place" : ". Drag it into place; tap, Space or R to turn it; arrow keys move it."}`}
                        onPointerDown={onPointerDown(i)}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerCancel={onPointerUp}
                        onKeyDown={onKeyDown(i)}
                        data-piece={piece.id}
                        data-cx={piece.centroid.x.toFixed(1)}
                        data-cy={piece.centroid.y.toFixed(1)}
                      >
                        {sheet}
                      </div>
                    </div>
                  );
                })}
              {done && (
                <div className={styles.mendedSheet} aria-hidden="true">
                  {sheet}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
