"use client";

// The editor's mood field, LiveJournal-style: a face and the words.
//
// Typing filters the list; picking a mood sets both the face and the words.
// The words can then be changed freely and the face stays ("tired" face,
// "stayed up reading" words) — LJ's "Other" mood. Clicking the face opens the
// list to change only the face. With no face picked, one is found from the
// words when possible.

import { useMemo, useRef, useState } from "react";
import { MoodIcon } from "@/components/mood-icon";
import {
  MOODS, MOOD_FAMILIES, MOOD_THEMES, getMood, moodKeyFor, resolveMood,
  type Mood, type MoodTheme,
} from "@/lib/moods";

const PICKABLE = MOODS.filter((m) => !m.hidden);

export function MoodInput({
  value,
  moodKey,
  theme,
  onChange,
  onThemeChange,
}: {
  value: string;
  moodKey: string | null;
  theme: MoodTheme;
  onChange: (next: { mood: string; moodKey: string | null }) => void;
  onThemeChange: (theme: MoodTheme) => void;
}) {
  const [open, setOpen] = useState(false);
  // "words": typing filters and picking sets the words too.
  // "face": opened from the face button; picking keeps the words.
  const [mode, setMode] = useState<"words" | "face">("words");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const resolved = resolveMood(moodKey, value);

  const matches: Mood[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PICKABLE;
    const starts = PICKABLE.filter((m) => m.label.startsWith(q));
    const rest = PICKABLE.filter((m) => !m.label.startsWith(q) && (m.label.includes(q) || m.family.startsWith(q)));
    return [...starts, ...rest];
  }, [query]);

  const grouped = !query.trim();

  function openList(nextMode: "words" | "face") {
    setMode(nextMode);
    setQuery("");
    setActive(0);
    setOpen(true);
  }

  function pick(m: Mood) {
    if (mode === "face" && value.trim()) onChange({ mood: value, moodKey: m.key });
    else onChange({ mood: m.label, moodKey: m.key });
    setOpen(false);
    setQuery("");
  }

  function type(text: string) {
    // Typing a mood's exact name picks its face; otherwise the face you chose
    // stays with your words. Clearing the words clears the face.
    const exact = getMood(moodKeyFor(text));
    const key = !text.trim() ? null : exact && !exact.hidden ? exact.key : moodKey;
    onChange({ mood: text, moodKey: key });
    setMode("words");
    setQuery(text);
    setActive(0);
    setOpen(true);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, matches.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (query.trim() && matches[active]) pick(matches[active]);
      else setOpen(false);
    } else if (e.key === "Escape") { setOpen(false); }
  }

  let flatIndex = -1;
  const option = (m: Mood) => {
    flatIndex += 1;
    const i = flatIndex;
    return (
      <button
        key={m.key}
        type="button"
        role="option"
        aria-selected={m.key === moodKey}
        className="mood-picker-option"
        data-active={!grouped && i === active}
        data-selected={m.key === moodKey}
        onMouseEnter={() => !grouped && setActive(i)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => pick(m)}
      >
        <MoodIcon family={m.family} theme={theme} size={18} />
        <span className="truncate">{m.label}</span>
      </button>
    );
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-1.5">
        <span className="text-xs flex-shrink-0" style={{ color: "var(--muted)" }}>feeling</span>
        <button
          type="button"
          onClick={() => (open && mode === "face" ? setOpen(false) : openList("face"))}
          className="flex-shrink-0 rounded-md p-0.5 transition hover:bg-[var(--surface-hover)]"
          title="Choose a face"
          aria-label={resolved ? `Face: ${resolved.mood?.label ?? resolved.family}. Choose a face` : "Choose a face"}
        >
          {resolved ? (
            <MoodIcon family={resolved.family} theme={theme} size={20} />
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.4"
              strokeDasharray="2.5 2" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
            </svg>
          )}
        </button>
        <input
          ref={inputRef}
          type="text"
          value={value}
          maxLength={100}
          onChange={(e) => type(e.target.value)}
          onFocus={() => !open && openList("words")}
          onKeyDown={onKeyDown}
          placeholder="your mood…"
          className="bg-transparent focus:outline-none text-sm min-w-0 w-32"
          style={{ color: "var(--foreground)" }}
          role="combobox"
          aria-expanded={open}
          aria-controls="mood-picker-list"
          aria-autocomplete="list"
        />
        {value && (
          <button
            type="button"
            onClick={() => { onChange({ mood: "", moodKey: null }); setOpen(false); }}
            className="text-xs opacity-40 hover:opacity-80 transition flex-shrink-0"
            aria-label="Clear mood"
          >×</button>
        )}
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-[45]" onClick={() => setOpen(false)} />
          <div
            className="absolute top-full left-0 mt-1.5 z-[50] rounded-xl border shadow-xl flex flex-col"
            style={{
              background: "var(--surface)", borderColor: "var(--border)",
              width: "min(560px, calc(100vw - 32px))", maxHeight: "min(420px, 60vh)",
            }}
          >
            <p className="px-3 pt-2.5 pb-1.5 text-xs" style={{ color: "var(--muted)" }}>
              {mode === "face"
                ? value.trim() ? "Pick a face. Your words stay as they are." : "Pick a mood."
                : query.trim() ? "Pick one, or keep typing your own words." : "Pick a mood, then change the words if you like."}
            </p>
            <div id="mood-picker-list" role="listbox" className="overflow-y-auto px-2 pb-2 mood-picker-grid">
              {grouped
                ? MOOD_FAMILIES.map((f) => {
                    const moods = PICKABLE.filter((m) => m.family === f.id);
                    return [
                      <div key={`h-${f.id}`} className="mood-picker-family">{f.label}</div>,
                      ...moods.map(option),
                    ];
                  })
                : matches.length > 0
                  ? matches.map(option)
                  : (
                    <p className="text-xs px-1 py-2" style={{ gridColumn: "1 / -1", color: "var(--muted)" }}>
                      {resolved
                        ? "No mood by that name. Your words will show with the face beside them."
                        : "No mood by that name. Your words will show on their own; click the circle to add a face."}
                    </p>
                  )}
            </div>
            <div className="flex items-center gap-2 px-3 py-2 border-t text-xs" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
              <span>Icon style</span>
              {MOOD_THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onThemeChange(t.id)}
                  title={t.description}
                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition"
                  style={{
                    borderColor: theme === t.id ? "var(--accent)" : "var(--border)",
                    background: theme === t.id ? "var(--accent-light)" : "transparent",
                    color: theme === t.id ? "var(--accent)" : "var(--muted)",
                  }}
                  aria-pressed={theme === t.id}
                >
                  <MoodIcon family="happy" theme={t.id} size={14} />
                  {t.label}
                </button>
              ))}
              <span className="ml-auto hidden sm:inline">Readers see your style</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function LocationInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1.5 flex-1 min-w-[9rem]">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0" style={{ color: "var(--muted)" }} aria-hidden="true">
        <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" />
      </svg>
      <input
        type="text"
        value={value}
        maxLength={100}
        onChange={(e) => onChange(e.target.value)}
        placeholder="where are you?"
        aria-label="Current location"
        className="bg-transparent focus:outline-none text-sm min-w-0 flex-1"
        style={{ color: "var(--foreground)" }}
      />
      {value && (
        <button type="button" onClick={() => onChange("")}
          className="text-xs opacity-40 hover:opacity-80 transition flex-shrink-0" aria-label="Clear location">×</button>
      )}
    </div>
  );
}
