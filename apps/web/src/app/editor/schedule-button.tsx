"use client";

import { useRef, useState } from "react";
import { FloatingPopup } from "@/components/floating-popup";

// Scheduling used to be findable only by opening Settings and typing a future
// date into the Date field, after which Publish quietly became Schedule. This
// puts it next to Publish: quick picks, a custom time, and the chosen time on
// the button itself. It only sets the entry's date — pressing Schedule still
// does the scheduling, exactly as before.

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function at(daysFromNow: number, hour: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function nextWeekday(target: number, hour: number): Date {
  const d = at(0, hour);
  const diff = (target - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return d;
}

const SHORT = { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" } as const;

export function ScheduleButton({
  value,
  isFuture,
  onChange,
}: {
  /** The entry date as a datetime-local string ("" for none). */
  value: string;
  /** True when `value` is in the future (i.e. the entry is scheduled on Publish). */
  isFuture: boolean;
  onChange: (value: string) => void;
}) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");

  const eveningToday = at(0, 18);
  const picks: { label: string; date: Date }[] = [
    ...(eveningToday.getTime() > Date.now() + 30 * 60_000 ? [{ label: "This evening", date: eveningToday }] : []),
    { label: "Tomorrow morning", date: at(1, 9) },
    { label: "Saturday morning", date: nextWeekday(6, 9) },
    { label: "Monday morning", date: nextWeekday(1, 9) },
  ];

  function choose(v: string) {
    onChange(v);
    setOpen(false);
  }

  const minCustom = toLocalInput(new Date(Date.now() + 5 * 60_000));
  const customOk = !!custom && new Date(custom).getTime() > Date.now() + 60_000;

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => {
          setCustom(isFuture ? value : toLocalInput(at(1, 9)));
          setOpen((o) => !o);
        }}
        className={`editor-schedule-btn${isFuture ? " is-set" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={isFuture ? "Change or clear the scheduled time" : "Schedule this entry to publish later"}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" />
        </svg>
        <span className={isFuture ? "" : "hidden sm:inline"}>
          {isFuture ? new Date(value).toLocaleString("en-US", SHORT) : "Later"}
        </span>
      </button>
      <FloatingPopup anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} placement="bottom" className="editor-schedule-popup">
        <div role="dialog" aria-label="Schedule for later">
          <p className="editor-schedule-title">Publish later</p>
          <p className="editor-schedule-sub">Pick a time, then press Schedule. It publishes itself, even if you&rsquo;re offline.</p>
          <div className="editor-schedule-picks">
            {picks.map((p) => (
              <button key={p.label} type="button" className="editor-schedule-pick" onClick={() => choose(toLocalInput(p.date))}>
                <span>{p.label}</span>
                <span className="editor-schedule-pick-time">{p.date.toLocaleString("en-US", SHORT)}</span>
              </button>
            ))}
          </div>
          <label className="editor-schedule-custom">
            <span>Or choose a time</span>
            <input type="datetime-local" value={custom} min={minCustom} onChange={(e) => setCustom(e.target.value)} />
          </label>
          <div className="editor-schedule-actions">
            {isFuture && (
              <button type="button" className="editor-schedule-clear" onClick={() => choose("")}>
                Don&rsquo;t schedule
              </button>
            )}
            <button type="button" className="editor-schedule-set" disabled={!customOk} onClick={() => choose(custom)}>
              Set time
            </button>
          </div>
        </div>
      </FloatingPopup>
    </>
  );
}
