"use client";

import { useEffect, useState } from "react";

export function ContentSafety() {
  const [showSensitive, setShowSensitive] = useState(false);
  const [eyeComfort, setEyeComfort] = useState(false);
  const [showStickies, setShowStickies] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  // A failed load must not look like "everything is off": the toggles would
  // show the wrong state and the next save would write it back.
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/me");
        if (!res.ok) {
          setLoadError(true);
          return;
        }
        const { data } = await res.json();
        setShowSensitive(!!data.settings?.show_sensitive_content);
        setEyeComfort(!!data.settings?.eye_comfort_mode);
        setShowStickies(!data.settings?.hide_stickies);
      } catch {
        setLoadError(true);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const toggleSetting = async (
    key: string,
    value: boolean,
    setter: (v: boolean) => void
  ): Promise<boolean> => {
    setter(value);
    setSaving(true);
    setSaveError(false);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { [key]: value } }),
      });
      // fetch doesn't throw on HTTP errors, so a rejected save used to leave
      // the checkbox showing the value that was never stored.
      if (!res.ok) {
        setter(!value);
        setSaveError(true);
        return false;
      }
      return true;
    } catch {
      setter(!value);
      setSaveError(true);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const applyEyeComfort = (on: boolean) => {
    document.body.classList.toggle("eye-comfort", on);
    localStorage.setItem("inkwell-eye-comfort", on ? "true" : "false");
  };

  if (!loaded) return null;

  if (loadError) {
    return (
      <div
        className="rounded-xl border p-5 mt-6"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <p className="text-sm" style={{ color: "var(--danger, #dc2626)" }}>
          Couldn&apos;t load these settings. Reload the page to try again. Nothing has been changed.
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border p-5 mt-6"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      {saveError && (
        <p className="text-sm mb-3" style={{ color: "var(--danger, #dc2626)" }}>
          Couldn&apos;t save that change. It has been put back the way it was — please try again.
        </p>
      )}
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
          checked={showStickies}
          onChange={(e) => {
            const show = e.target.checked;
            setShowStickies(show);
            toggleSetting("hide_stickies", !show, (hidden) => setShowStickies(!hidden));
          }}
          disabled={saving}
          className="mt-0.5"
        />
        <div>
          <span className="text-sm font-medium">Show Stickies in Feed and Explore</span>
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
            Stickies are short thoughts, drawn as sticky notes. Turn this off to see only
            journal entries. You&apos;ll still find stickies on writers&apos; profiles.
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
          onChange={async (e) => {
            const val = e.target.checked;
            applyEyeComfort(val);
            const ok = await toggleSetting("eye_comfort_mode", val, setEyeComfort);
            if (!ok) applyEyeComfort(!val);
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
