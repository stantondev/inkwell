"use client";

import { useEffect, useState } from "react";

export function ContentSafety() {
  const [showSensitive, setShowSensitive] = useState(false);
  const [eyeComfort, setEyeComfort] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/me");
        if (!res.ok) return;
        const { data } = await res.json();
        setShowSensitive(!!data.settings?.show_sensitive_content);
        setEyeComfort(!!data.settings?.eye_comfort_mode);
      } catch {
        // ignore
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const toggleSetting = async (
    key: string,
    value: boolean,
    setter: (v: boolean) => void
  ) => {
    setter(value);
    setSaving(true);
    try {
      await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { [key]: value } }),
      });
    } catch {
      setter(!value);
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
          onChange={(e) => toggleSetting("show_sensitive_content", e.target.checked, setShowSensitive)}
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
      <label
        className="flex items-start gap-3 cursor-pointer mt-4 pt-4"
        style={{ opacity: saving ? 0.6 : 1, borderTop: "1px solid var(--border)" }}
      >
        <input
          type="checkbox"
          checked={eyeComfort}
          onChange={(e) => {
            const val = e.target.checked;
            toggleSetting("eye_comfort_mode", val, setEyeComfort);
            document.body.classList.toggle("eye-comfort", val);
            localStorage.setItem("inkwell-eye-comfort", val ? "true" : "false");
          }}
          disabled={saving}
          className="mt-0.5"
        />
        <div>
          <span className="text-sm font-medium">Eye comfort mode</span>
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
            Use warm sepia tones to reduce eye strain. Applies across the editor,
            feed, and all reading views. Also available in the editor toolbar.
          </p>
        </div>
      </label>
    </div>
  );
}
