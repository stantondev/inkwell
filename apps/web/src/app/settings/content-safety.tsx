"use client";

import { useEffect, useState } from "react";

export function ContentSafety() {
  const [showSensitive, setShowSensitive] = useState(false);
  const [soundsMuted, setSoundsMuted] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/me");
        if (!res.ok) return;
        const { data } = await res.json();
        setShowSensitive(!!data.settings?.show_sensitive_content);
        setSoundsMuted(!!data.settings?.notification_sounds_muted);
      } catch {
        // ignore
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const toggleSensitive = async (value: boolean) => {
    setShowSensitive(value);
    setSaving(true);
    try {
      await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: { show_sensitive_content: value },
        }),
      });
    } catch {
      setShowSensitive(!value);
    } finally {
      setSaving(false);
    }
  };

  const toggleSounds = async (value: boolean) => {
    setSoundsMuted(value);
    setSaving(true);
    try {
      await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: { notification_sounds_muted: value },
        }),
      });
    } catch {
      setSoundsMuted(!value);
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return null;

  return (
    <div
      className="rounded-xl border p-5 mt-6"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <h3
        className="text-base font-semibold mb-3"
        style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
      >
        Content &amp; Safety
      </h3>
      <label
        className="flex items-start gap-3 cursor-pointer"
        style={{ opacity: saving ? 0.6 : 1 }}
      >
        <input
          type="checkbox"
          checked={showSensitive}
          onChange={(e) => toggleSensitive(e.target.checked)}
          disabled={saving}
          className="mt-0.5"
        />
        <div>
          <span className="text-sm font-medium">Show sensitive content in Explore</span>
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
            When enabled, entries marked as sensitive appear in Explore behind content warnings.
            When disabled, they are hidden entirely.
          </p>
        </div>
      </label>

      <div
        className="border-t mt-4 pt-4"
        style={{ borderColor: "var(--border)" }}
      >
        <label
          className="flex items-start gap-3 cursor-pointer"
          style={{ opacity: saving ? 0.6 : 1 }}
        >
          <input
            type="checkbox"
            checked={soundsMuted}
            onChange={(e) => toggleSounds(e.target.checked)}
            disabled={saving}
            className="mt-0.5"
          />
          <div>
            <span className="text-sm font-medium">Mute notification sounds</span>
            <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
              When enabled, Inkwell won&apos;t play a sound when new notifications or letters arrive.
            </p>
          </div>
        </label>
      </div>
    </div>
  );
}
