"use client";

import { useEffect, useState } from "react";

export function ContentSafety() {
  const [showSensitive, setShowSensitive] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/me");
        if (!res.ok) return;
        const { data } = await res.json();
        setShowSensitive(!!data.settings?.show_sensitive_content);
      } catch {
        // ignore
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const toggle = async (value: boolean) => {
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
          onChange={(e) => toggle(e.target.checked)}
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
    </div>
  );
}
