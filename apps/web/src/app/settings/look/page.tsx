"use client";

import { useEffect, useState } from "react";
import { saveSiteLook, siteLookOf, type SiteLook } from "@/lib/site-look";
import { SEASON_COOKIE } from "@/lib/seasons";

const OPTIONS: { id: SiteLook; title: string; blurb: string }[] = [
  {
    id: "modern",
    title: "Modern",
    blurb: "Inkwell as it's designed today: Feed and Explore read like a book you turn the pages of.",
  },
  {
    id: "classic",
    title: "Classic (2004)",
    blurb:
      "Feed and Explore become one long column of boxed entries, the way journals looked in 2004: big userpics, “Current mood”, and “( 3 comments | Leave a comment )”. The rest of the site switches to the colours and type of the early-2000s web.",
  },
];

function Preview({ look }: { look: SiteLook }) {
  if (look === "modern") {
    return (
      <div className="look-preview look-preview-modern" aria-hidden="true">
        <div className="look-preview-page" />
        <div className="look-preview-page" />
      </div>
    );
  }
  return (
    <div className="look-preview look-preview-classic" aria-hidden="true">
      {[0, 1].map((i) => (
        <div key={i} className="look-preview-entry">
          <div className="look-preview-bar" />
          <div className="look-preview-row">
            <div className="look-preview-pic" />
            <div className="look-preview-lines"><span /><span /><span /></div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function LookPage() {
  const [current, setCurrent] = useState<SiteLook | null>(null);
  const [saving, setSaving] = useState<SiteLook | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seasonal, setSeasonal] = useState<boolean | null>(null);
  const [seasonalSaving, setSeasonalSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/me");
        if (!res.ok) throw new Error();
        const { data } = await res.json();
        setCurrent(siteLookOf(data?.settings));
        setSeasonal(data?.settings?.seasonal_decorations !== false);
      } catch {
        setError("Couldn't load your setting. Refresh to try again.");
      }
    })();
  }, []);

  async function choose(look: SiteLook) {
    if (look === current || saving) return;
    setSaving(look);
    setError(null);
    if (!(await saveSiteLook(look))) {
      setSaving(null);
      setError("That didn't save. Try again in a moment.");
    }
  }

  async function toggleSeasonal(on: boolean) {
    if (seasonalSaving) return;
    setSeasonalSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { seasonal_decorations: on } }),
      });
      if (!res.ok) throw new Error();
      // The cookie covers this browser when signed out; keep it in step.
      document.cookie = on
        ? `${SEASON_COOKIE}=; path=/; max-age=0; samesite=lax`
        : `${SEASON_COOKIE}=off; path=/; max-age=${60 * 60 * 24 * 60}; samesite=lax`;
      // The server draws the decorations, so reload to show the change.
      window.location.reload();
    } catch {
      setSeasonalSaving(false);
      setError("That didn't save. Try again in a moment.");
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        How Inkwell looks to you. Only you see your choice: writers&rsquo; journals keep the
        themes they chose, and your own journal looks the same to everyone.
      </p>
      <div className="grid gap-4 sm:grid-cols-2" role="radiogroup" aria-label="Look & feel">
        {OPTIONS.map((o) => {
          const selected = current === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={current === null || saving !== null}
              onClick={() => choose(o.id)}
              className="text-left rounded-xl border p-4 transition disabled:cursor-default"
              style={{
                borderColor: selected ? "var(--accent)" : "var(--border)",
                background: selected ? "var(--accent-light)" : "var(--surface)",
                boxShadow: selected ? "0 0 0 1px var(--accent)" : undefined,
              }}
            >
              <Preview look={o.id} />
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="font-semibold">{o.title}</span>
                <span className="text-xs" style={{ color: selected ? "var(--accent)" : "var(--muted)" }}>
                  {saving === o.id ? "Switching…" : selected ? "In use" : "Use this"}
                </span>
              </div>
              <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>{o.blurb}</p>
            </button>
          );
        })}
      </div>
      <div
        className="rounded-xl border p-4 flex items-start justify-between gap-4"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div>
          <p className="font-semibold">Holiday decorations</p>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            Inkwell dresses up for the holidays for a few days around them: colours, a decorated logo,
            and a few surprises (for Hallowe&rsquo;en, bats and a trick-or-treat pumpkin). Turn this
            off to keep Inkwell as it always looks.
          </p>
        </div>
        <label className="flex items-center gap-2 shrink-0 cursor-pointer">
          <input
            type="checkbox"
            className="h-5 w-5"
            style={{ accentColor: "var(--accent)" }}
            checked={!!seasonal}
            disabled={seasonal === null || seasonalSaving}
            onChange={(e) => toggleSeasonal(e.target.checked)}
            aria-label="Holiday decorations"
          />
          <span className="text-sm">{seasonalSaving ? "Saving…" : seasonal ? "On" : "Off"}</span>
        </label>
      </div>
      {error && <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>}
    </div>
  );
}
