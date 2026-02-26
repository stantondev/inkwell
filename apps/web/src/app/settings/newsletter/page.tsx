"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface NewsletterSettings {
  newsletter_enabled: boolean;
  newsletter_name: string | null;
  newsletter_description: string | null;
  newsletter_reply_to: string | null;
  subscriber_count: number;
  subscriber_limit: number | null;
}

export default function NewsletterSettingsPage() {
  const [settings, setSettings] = useState<NewsletterSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isPlus, setIsPlus] = useState(false);
  const [username, setUsername] = useState("");

  // Form state
  const [enabled, setEnabled] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [replyTo, setReplyTo] = useState("");

  const load = useCallback(async () => {
    try {
      const [settingsRes, meRes] = await Promise.all([
        fetch("/api/newsletter/settings"),
        fetch("/api/auth/me"),
      ]);
      if (settingsRes.ok) {
        const data = await settingsRes.json();
        const s = data.data;
        setSettings(s);
        setEnabled(s.newsletter_enabled);
        setName(s.newsletter_name || "");
        setDescription(s.newsletter_description || "");
        setReplyTo(s.newsletter_reply_to || "");
      }
      if (meRes.ok) {
        const meData = await meRes.json();
        setIsPlus((meData.data?.subscription_tier || "free") === "plus");
        setUsername(meData.data?.username || "");
      }
    } catch {
      setError("Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const body: Record<string, unknown> = {
        newsletter_enabled: enabled,
        newsletter_description: description || null,
      };
      if (isPlus) {
        body.newsletter_name = name || null;
        body.newsletter_reply_to = replyTo || null;
      }

      const res = await fetch("/api/newsletter/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data.data);
        setSuccess("Newsletter settings saved");
        setTimeout(() => setSuccess(""), 3000);
      } else {
        const data = await res.json();
        setError(data.error || data.errors || "Failed to save");
      }
    } catch {
      setError("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-sm" style={{ color: "var(--muted)" }}>Loading...</div>;
  }

  const subscriberCount = settings?.subscriber_count ?? 0;
  const subscriberLimit = settings?.subscriber_limit;

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border p-4 text-sm" style={{ borderColor: "var(--danger)", background: "var(--surface)" }}>
          <span style={{ color: "var(--danger)" }}>{error}</span>
        </div>
      )}
      {success && (
        <div className="rounded-xl border p-4 text-sm" style={{ borderColor: "var(--accent)", background: "var(--surface)" }}>
          <span style={{ color: "var(--accent)" }}>{success}</span>
        </div>
      )}

      {/* Enable toggle */}
      <div className="rounded-xl border p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
              Email Newsletter
            </h2>
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
              Let readers subscribe to receive your entries via email
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 rounded-full peer-focus:ring-2 peer-focus:ring-[var(--accent)] peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:rounded-full after:h-5 after:w-5 after:transition-all"
              style={{
                background: enabled ? "var(--accent)" : "var(--border)",
                // after pseudo-element handled by Tailwind
              }}
            >
              <div className={`absolute top-[2px] h-5 w-5 rounded-full bg-white transition-transform ${enabled ? "translate-x-5" : "translate-x-[2px]"}`} />
            </div>
          </label>
        </div>

        {enabled && (
          <div className="pt-4 border-t space-y-4" style={{ borderColor: "var(--border)" }}>
            {/* Subscriber count */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-2xl font-semibold">{subscriberCount}</span>
                <span className="text-sm ml-2" style={{ color: "var(--muted)" }}>
                  {subscriberLimit ? `/ ${subscriberLimit} subscribers` : "subscribers"}
                </span>
              </div>
              <Link href="/settings/newsletter/subscribers"
                className="text-sm font-medium" style={{ color: "var(--accent)" }}>
                View list
              </Link>
            </div>

            {subscriberLimit && subscriberCount >= subscriberLimit * 0.8 && (
              <div className="text-sm p-3 rounded-lg" style={{ background: "var(--background)", color: "var(--muted)" }}>
                {subscriberCount >= subscriberLimit
                  ? "You've reached your subscriber limit. "
                  : "You're approaching your subscriber limit. "}
                <Link href="/settings/billing" className="font-medium" style={{ color: "var(--accent)" }}>
                  Upgrade to Plus
                </Link>
                {" "}for unlimited subscribers.
              </div>
            )}

            {/* Subscribe page link */}
            <div>
              <label className="block text-sm font-medium mb-1">Your subscribe page</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={username ? `https://inkwell.social/${username}/subscribe` : ""}
                  className="flex-1 rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--muted)" }}
                  onFocus={(e) => {
                    // Replace with actual username URL
                    e.target.select();
                  }}
                />
              </div>
              <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                Share this link so people can subscribe to your newsletter
              </p>
            </div>
          </div>
        )}
      </div>

      {enabled && (
        <>
          {/* Newsletter details */}
          <div className="rounded-xl border p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <h3 className="text-sm font-semibold mb-4" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
              Newsletter Details
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Newsletter name
                  {!isPlus && <span className="text-xs ml-2" style={{ color: "var(--muted)" }}>(Plus)</span>}
                </label>
                {isPlus ? (
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., The Weekly Muse"
                    maxLength={200}
                    className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--foreground)" }}
                  />
                ) : (
                  <div className="text-sm p-3 rounded-lg" style={{ background: "var(--background)", color: "var(--muted)" }}>
                    Your display name will be used. <Link href="/settings/billing" className="font-medium" style={{ color: "var(--accent)" }}>Upgrade to Plus</Link> for a custom name.
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="A short tagline for your newsletter"
                  maxLength={500}
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--foreground)" }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Reply-to email
                  {!isPlus && <span className="text-xs ml-2" style={{ color: "var(--muted)" }}>(Plus)</span>}
                </label>
                {isPlus ? (
                  <input
                    type="email"
                    value={replyTo}
                    onChange={(e) => setReplyTo(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--foreground)" }}
                  />
                ) : (
                  <div className="text-sm p-3 rounded-lg" style={{ background: "var(--background)", color: "var(--muted)" }}>
                    <Link href="/settings/billing" className="font-medium" style={{ color: "var(--accent)" }}>Upgrade to Plus</Link> to set a reply-to address.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Send history link */}
          <div className="rounded-xl border p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
                  Send History
                </h3>
                <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
                  View past newsletter sends and their status
                </p>
              </div>
              <Link href="/settings/newsletter/sends"
                className="text-sm font-medium" style={{ color: "var(--accent)" }}>
                View sends
              </Link>
            </div>
          </div>
        </>
      )}

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="rounded-full px-6 py-2.5 text-sm font-medium transition-opacity disabled:opacity-50"
        style={{ background: "var(--accent)", color: "#fff" }}
      >
        {saving ? "Saving..." : "Save settings"}
      </button>
    </div>
  );
}
