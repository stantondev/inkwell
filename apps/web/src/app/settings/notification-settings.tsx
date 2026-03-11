"use client";

import { useEffect, useState } from "react";

export function NotificationSettings() {
  const [soundsMuted, setSoundsMuted] = useState(false);
  const [autoMarkRead, setAutoMarkRead] = useState(false);
  const [hideBadges, setHideBadges] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/me");
        if (!res.ok) return;
        const { data } = await res.json();
        setSoundsMuted(!!data.settings?.notification_sounds_muted);
        setAutoMarkRead(!!data.settings?.auto_mark_notifications_read);
        setHideBadges(!!data.settings?.hide_notification_badges);
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
        Notifications
      </h3>

      <label
        className="flex items-start gap-3 cursor-pointer"
        style={{ opacity: saving ? 0.6 : 1 }}
      >
        <input
          type="checkbox"
          checked={soundsMuted}
          onChange={(e) => toggleSetting("notification_sounds_muted", e.target.checked, setSoundsMuted)}
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

      <label
        className="flex items-start gap-3 cursor-pointer mt-4"
        style={{ opacity: saving ? 0.6 : 1 }}
      >
        <input
          type="checkbox"
          checked={autoMarkRead}
          onChange={(e) => toggleSetting("auto_mark_notifications_read", e.target.checked, setAutoMarkRead)}
          disabled={saving}
          className="mt-0.5"
        />
        <div>
          <span className="text-sm font-medium">Auto-mark notifications as read</span>
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
            Automatically mark all notifications as read when you open the Notifications page.
          </p>
        </div>
      </label>

      <label
        className="flex items-start gap-3 cursor-pointer mt-4"
        style={{ opacity: saving ? 0.6 : 1 }}
      >
        <input
          type="checkbox"
          checked={hideBadges}
          onChange={(e) => toggleSetting("hide_notification_badges", e.target.checked, setHideBadges)}
          disabled={saving}
          className="mt-0.5"
        />
        <div>
          <span className="text-sm font-medium">Hide notification badges</span>
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
            Hide unread count badges in the sidebar, tab title, and favicon. Notifications are still accessible on the Notifications page.
          </p>
        </div>
      </label>
    </div>
  );
}
