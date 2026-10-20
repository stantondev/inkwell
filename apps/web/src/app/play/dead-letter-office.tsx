"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Week } from "@/lib/dead-letter/weeks";
import { WEEKDAYS, arrivalDay, lettersArrived, localDay, namesMystery } from "@/lib/dead-letter/weeks";
import { RULES, type Level } from "@/lib/dead-letter/difficulty";
import { easier, rankFor, totalScore } from "@/lib/dead-letter/score";
import {
  clearAll,
  loadLevel,
  loadOpenAll,
  loadProgress,
  loadWeek,
  saveLevel,
  saveOpenAll,
  saveProgress,
  saveWeek,
  type Phase,
  type Progress,
  type WeekProgress,
} from "@/lib/dead-letter/progress";
import { loadSoundPref, paperLift, setSoundPref } from "@/lib/dead-letter/sound";
import { MendDesk } from "./mend-desk";
import { ReadLetter } from "./read-letter";
import { SortingTable } from "./sorting-table";
import { Delivered } from "./delivered";
import { WeekStrip } from "./week-strip";
import { TheFile } from "./the-file";
import { HowToPlay } from "./how-to-play";
import { LevelPicker } from "./level-picker";
import { fell, hand } from "./fonts";
import { trackFeature } from "@/lib/usage";
import styles from "./play.module.css";

const STEPS: { phase: Phase; label: string }[] = [
  { phase: "mend", label: "Mend" },
  { phase: "read", label: "Read" },
  { phase: "deliver", label: "Deliver" },
];

const SEEN_HOWTO = "inkwell-dlo:seen-how-to";

function longDate(day: string) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
}

function Bundle({ left }: { left: number }) {
  return (
    <div className={styles.bundle} aria-hidden="true">
      {Array.from({ length: Math.max(1, left) }, (_, i) => (
        <span key={i} className={styles.bundleLetter} style={{ ["--i" as string]: i }} />
      ))}
      <span className={styles.string} />
      <span className={styles.tag}>
        <span className={styles.tagLine1}>Dead letters</span>
        <span className={styles.tagLine2}>Addressee unknown</span>
      </span>
    </div>
  );
}

export function DeadLetterOffice({ week, preview = false }: { week: Week; preview?: boolean }) {
  // Rendered only in the browser (see play-client.tsx), so this can read storage straight away.
  const [today] = useState(localDay);
  // "Open the whole week now" is a testing tool: ignored in production, so letters arrive one a weekday.
  const [openAll, setOpenAll] = useState(() => process.env.NODE_ENV !== "production" && loadOpenAll());
  const arrived = lettersArrived(week, today, openAll || preview);
  const [progress, setProgress] = useState<Progress[]>(() => week.letters.map((l) => loadProgress(l.id)));
  const [weekProgress, setWeekProgress] = useState<WeekProgress>(() => loadWeek(week.id));
  const [selected, setSelected] = useState(() => {
    const firstUndone = progress.findIndex((q, i) => i < arrived && q.phase !== "delivered");
    return firstUndone >= 0 ? firstUndone : Math.max(0, arrived - 1);
  });
  const [sound, setSound] = useState(loadSoundPref);
  const [level, setLevelState] = useState<Level>(loadLevel);
  const [justDelivered, setJustDelivered] = useState<number | null>(null);
  const [fileOpen, setFileOpen] = useState(false);
  const [howTo, setHowTo] = useState(() => {
    try {
      return window.localStorage.getItem(SEEN_HOWTO) !== "1";
    } catch {
      return false;
    }
  });
  const fileRef = useRef<HTMLElement>(null);
  const dayRef = useRef<HTMLDivElement>(null);
  /** Bring today's letter to the top of the screen (the week and the file stay just above). */
  const toDay = () => window.setTimeout(() => dayRef.current?.scrollIntoView({ block: "start" }), 0);

  const letter = week.letters[selected];
  const p = progress[selected];
  const inPlay = p.phase === "mend" || p.phase === "read" || p.phase === "deliver";

  /** Change one letter's progress (from its newest saved state) and save it. */
  const change = useCallback(
    (day: number, fn: (cur: Progress) => Progress) => {
      setProgress((all) => {
        const next = fn(all[day]);
        saveProgress(week.letters[day].id, next);
        return all.map((q, i) => (i === day ? next : q));
      });
    },
    [week.letters],
  );

  /** Change level. A letter already started scores at the easiest level it was played on. */
  const setLevel = (l: Level) => {
    setLevelState(l);
    saveLevel(l);
    if (inPlay) change(selected, (cur) => ({ ...cur, level: easier(cur.level ?? l, l) }));
  };

  const total = totalScore(progress, [weekProgress]);
  const rank = rankFor(total);

  // A promotion is announced once, the moment the total crosses into a new rank.
  const shownRank = useRef(rank.title);
  const [promoted, setPromoted] = useState<string | null>(null);
  useEffect(() => {
    if (rank.title === shownRank.current) return;
    shownRank.current = rank.title;
    const show = window.setTimeout(() => setPromoted(rank.title), 0);
    const hide = window.setTimeout(() => setPromoted(null), 5200);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
  }, [rank.title]);

  // Who's playing (Admin → Usage): opening the office and each letter's steps,
  // with the level. Never the score. Draft previews aren't counted.
  const track = (action: "opened" | "letter_started" | "letter_delivered" | "writer_named", l: Level) => {
    if (!preview) trackFeature("play", action, l);
  };
  const countedOpen = useRef(false);
  useEffect(() => {
    if (countedOpen.current) return;
    countedOpen.current = true;
    if (!preview) trackFeature("play", "opened", level);
  }, [preview, level]);

  const go = (phase: Phase, extra: Partial<Progress> = {}) => {
    change(selected, (cur) => ({ ...cur, ...extra, phase }));
    toDay();
  };

  const updateWeek = (next: WeekProgress) => {
    setWeekProgress(next);
    saveWeek(week.id, next);
  };

  const guess = (g: string) => {
    const right = namesMystery(week, g);
    if (right && weekProgress.namedOnDay === null) track("writer_named", level);
    // Named "on" the newest letter that had arrived when they named it.
    updateWeek({
      ...weekProgress,
      guesses: [...weekProgress.guesses, g],
      namedOnDay: right ? Math.max(0, arrived - 1) : weekProgress.namedOnDay,
    });
    return right;
  };

  const openFile = () => {
    setFileOpen(true);
    window.setTimeout(() => fileRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const closeHowTo = () => {
    setHowTo(false);
    try {
      window.localStorage.setItem(SEEN_HOWTO, "1");
    } catch {
      /* ignore */
    }
  };

  const stepIndex = STEPS.findIndex((s) => s.phase === p.phase);
  const nextIdx = progress.findIndex((q, i) => i > selected && q.phase !== "delivered");
  const next = nextIdx < 0 ? null : { day: nextIdx, open: nextIdx < arrived };

  return (
    <div className={`${styles.office} ${fell.variable} ${hand.variable}`}>
      <div className={styles.inner}>
        {preview && week.status === "draft" && (
          <p className={styles.draftBanner} role="note">
            <strong>Draft week, not approved.</strong> Readers can’t see it. Read every letter and its history,
            check the sources, then set <code>status: &quot;approved&quot;</code> in its file.
          </p>
        )}
        <header className={styles.top}>
          <div>
            <p className={styles.kicker}>Inkwell · A letter a day</p>
            <h1 className={styles.title}>The Dead Letter Office</h1>
            <p className={styles.subtitle}>
              Bundle No. {week.number} · five letters in one hand · {longDate(week.starts)} to {longDate(arrivalDay(week, 4))}
            </p>
          </div>
          <div className={styles.topTools}>
            <LevelPicker level={level} onChange={setLevel} />
            <button type="button" className={styles.toolButton} onClick={() => setHowTo(true)}>
              How to play
            </button>
            <button
              type="button"
              className={styles.toolButton}
              aria-pressed={sound}
              onClick={() => {
                setSound(!sound);
                setSoundPref(!sound);
              }}
            >
              {sound ? "Sound on" : "Sound off"}
            </button>
          </div>
        </header>

        {arrived === 0 ? (
          <section className={styles.arrive}>
            <Bundle left={5} />
            <div className={styles.arriveText}>
              <p className={styles.letterNo}>Coming {WEEKDAYS[0]}</p>
              <p className={styles.arriveLead}>The first bundle reaches the office on {longDate(week.starts)}.</p>
            </div>
          </section>
        ) : (
          <>
            <WeekStrip
              week={week}
              arrived={arrived}
              phases={progress.map((q) => q.phase)}
              selected={selected}
              onSelect={(d) => {
                setSelected(d);
                setJustDelivered(null);
              }}
            />

            <div className={styles.scoreLine} aria-live="polite">
              <span className={styles.scoreTotal}>
                <span className={styles.scoreNumber}>{total}</span> points
              </span>
              <span className={styles.rankTitle}>{rank.title}</span>
              {rank.next && (
                <span className={styles.rankNext}>
                  <span className={styles.rankBar} aria-hidden="true">
                    <span style={{ width: `${Math.round(rank.progress * 100)}%` }} />
                  </span>
                  {rank.next.at - total} to {rank.next.title}
                </span>
              )}
            </div>

            <TheFile
              ref={fileRef}
              week={week}
              delivered={progress.map((q) => q.phase === "delivered")}
              weekProgress={weekProgress}
              open={fileOpen}
              onToggle={setFileOpen}
              onGuess={guess}
              onGiveUp={() => updateWeek({ ...weekProgress, revealed: true })}
            />

            <div ref={dayRef} className={styles.dayHead}>
              <h2 className={styles.dayTitle}>
                {WEEKDAYS[selected]}’s letter
                {selected < arrived - 1 && p.phase !== "delivered" && <span className={styles.waited}>waited for you</span>}
              </h2>
              {stepIndex >= 0 && (
                <ol className={styles.steps} aria-label="Steps">
                  {STEPS.map((s, i) => (
                    <li
                      key={s.phase}
                      className={`${styles.step} ${i < stepIndex ? styles.stepDone : ""} ${i === stepIndex ? styles.stepNow : ""}`}
                      aria-current={i === stepIndex ? "step" : undefined}
                    >
                      {s.label}
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {inPlay && p.level && p.level !== level && (
              <p className={styles.levelNote}>
                This letter scores as {RULES[p.level].label}, the easiest level you’ve used on it.
              </p>
            )}

            <div key={`${selected}:${p.phase}`} className={styles.stage}>
              {p.phase === "arrive" ? (
                <section className={styles.arrive}>
                  <Bundle left={5 - selected} />
                  <div className={styles.arriveText}>
                    <p className={styles.letterNo}>
                      Letter {selected + 1} of {week.letters.length}
                    </p>
                    <p className={styles.arriveLead}>
                      {selected === 0
                        ? "This week’s bundle came in: five letters tied with string, all in the same hand, the addresses gone. One comes off the pile each day."
                        : "The next letter comes off the bundle. Same hand, same washed-out signature."}
                    </p>
                    <p className={styles.arriveSmall}>About five minutes. Hints whenever you want them. How hard should it be?</p>
                    <LevelPicker level={level} onChange={setLevel} cards />
                    <button
                      type="button"
                      className={styles.primary}
                      onClick={() => {
                        paperLift();
                        track("letter_started", level);
                        go("mend", { level });
                      }}
                    >
                      {selected === 0 ? "Untie the bundle" : "Take it from the bundle"}
                    </button>
                  </div>
                </section>
              ) : p.phase === "mend" ? (
                <MendDesk
                  key={level}
                  letter={letter}
                  level={level}
                  onHint={() => change(selected, (cur) => ({ ...cur, hints: cur.hints + 1 }))}
                  onMended={(byClerk) => go("read", { mendedByClerk: byClerk })}
                />
              ) : p.phase === "read" ? (
                <ReadLetter letter={letter} level={level} progress={p} onChange={(n) => change(selected, () => n)} onDone={() => go("deliver")} />
              ) : p.phase === "deliver" ? (
                <SortingTable
                  letter={letter}
                  level={level}
                  tries={p.deliveryTries}
                  eliminated={p.eliminated}
                  onTry={() => change(selected, (cur) => ({ ...cur, deliveryTries: cur.deliveryTries + 1 }))}
                  onEliminate={(id) => change(selected, (cur) => ({ ...cur, eliminated: [...cur.eliminated, id], hints: cur.hints + 1 }))}
                  onDelivered={() => {
                    track("letter_delivered", p.level ?? level);
                    change(selected, (cur) => ({ ...cur, phase: "delivered", level: cur.level ?? level, deliveredAt: new Date().toISOString() }));
                    setJustDelivered(selected);
                    toDay();
                  }}
                />
              ) : (
                <Delivered
                  week={week}
                  letter={letter}
                  progress={p}
                  weekProgress={weekProgress}
                  animate={justDelivered === selected}
                  nextDay={next}
                  onNext={() => {
                    if (!next) return;
                    setSelected(next.day);
                    setJustDelivered(null);
                    toDay();
                  }}
                  onOpenFile={openFile}
                />
              )}
            </div>
          </>
        )}

        {/* Testing tools: local development and draft previews only. */}
        {(preview || process.env.NODE_ENV !== "production") && (
        <footer className={styles.foot}>
          <span className={styles.footLabel}>{preview ? `Preview · ${week.id} · ${week.status}` : "Prototype"}</span>
          <label className={styles.footToggle}>
            <input
              type="checkbox"
              checked={openAll}
              onChange={(e) => {
                setOpenAll(e.target.checked);
                saveOpenAll(e.target.checked);
              }}
            />
            Open the whole week now
          </label>
          <button
            type="button"
            className={styles.toolButton}
            onClick={() => {
              if (!window.confirm("Start this week’s bundle again from the beginning?")) return;
              clearAll(
                week.letters.map((l) => l.id),
                week.id,
              );
              window.location.reload();
            }}
          >
            Start the week again
          </button>
        </footer>
        )}
      </div>

      {promoted && (
        <div className={styles.promotion} role="status">
          <span className={styles.promotionKicker}>Promoted</span>
          <span className={styles.promotionTitle}>{promoted}</span>
        </div>
      )}

      <HowToPlay open={howTo} onClose={closeHowTo} />
    </div>
  );
}
