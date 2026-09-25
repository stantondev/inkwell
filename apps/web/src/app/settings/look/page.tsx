"use client";

import { useEffect, useState } from "react";
import { saveSiteLook, siteLookOf, type SiteLook } from "@/lib/site-look";
import { MOTION_EFFECTS_EVENT } from "@/components/tilt-effects";

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
  const [motion, setMotion] = useState<boolean | null>(null);
  const [motionNote, setMotionNote] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/me");
        if (!res.ok) throw new Error();
        const { data } = await res.json();
        setCurrent(siteLookOf(data?.settings));
        setMotion(data?.settings?.motion_effects === true);
      } catch {
        setError("Couldn't load your setting. Refresh to try again.");
      }
    })();
  }, []);

  async function toggleMotion() {
    if (motion === null) return;
    const next = !motion;
    setMotionNote(null);
    // iPhones ask permission for the motion sensor, and only during a tap.
    const Ctor = (typeof DeviceOrientationEvent !== "undefined" ? DeviceOrientationEvent : null) as
      | (typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> })
      | null;
    if (next && Ctor?.requestPermission) {
      try {
        if ((await Ctor.requestPermission()) !== "granted") {
          setMotionNote("Motion access was turned down, so tilt can't work. You can allow it in Safari's settings for this site.");
          return;
        }
      } catch { /* not a tap-driven context; carry on */ }
    }
    setMotion(next);
    window.dispatchEvent(new CustomEvent(MOTION_EFFECTS_EVENT, { detail: next }));
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { motion_effects: next } }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setMotion(!next);
      window.dispatchEvent(new CustomEvent(MOTION_EFFECTS_EVENT, { detail: !next }));
      setMotionNote("That didn't save. Try again in a moment.");
    }
  }

  async function choose(look: SiteLook) {
    if (look === current || saving) return;
    setSaving(look);
    setError(null);
    if (!(await saveSiteLook(look))) {
      setSaving(null);
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
      {error && <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>}
      <div className="rounded-xl border p-4 flex items-start justify-between gap-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <div>
          <p className="font-semibold">Tilt effects</p>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            On your phone, stamps, archive postmarks and avatar frames shift a little and catch the light as
            you tilt it. Off when your device is set to reduce motion.
          </p>
          {motionNote && <p className="mt-2 text-sm" style={{ color: "var(--danger)" }}>{motionNote}</p>}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={motion === true}
          aria-label="Tilt effects"
          disabled={motion === null}
          onClick={toggleMotion}
          className="relative flex-shrink-0 w-11 h-6 rounded-full transition-colors"
          style={{ background: motion ? "var(--accent)" : "var(--border)" }}
        >
          <span
            className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
            style={{ left: motion ? "calc(100% - 22px)" : "2px", boxShadow: "0 1px 2px rgba(0,0,0,0.2)" }}
          />
        </button>
      </div>
    </div>
  );
}
