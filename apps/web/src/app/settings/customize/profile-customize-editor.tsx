"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { PROFILE_THEMES, PROFILE_FONTS, PROFILE_LAYOUTS } from "@/lib/profile-themes";
import { resizeBackgroundImage } from "@/lib/image-utils";
import { parseMusicUrl } from "@/lib/music";
import { MusicPlayer } from "@/components/music-player";

interface ProfileUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  subscription_tier?: string;
  profile_html?: string | null;
  profile_css?: string | null;
  profile_music?: string | null;
  profile_background_url?: string | null;
  profile_background_color?: string | null;
  profile_accent_color?: string | null;
  profile_font?: string | null;
  profile_layout?: string | null;
  profile_widgets?: Record<string, unknown> | null;
  profile_status?: string | null;
  profile_theme?: string | null;
}

const DEFAULT_WIDGET_ORDER = ["about", "entries", "top_pals", "guestbook", "music", "custom_html"];

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border rounded-xl overflow-hidden" style={{ borderColor: "var(--border)" }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-left transition-colors hover:bg-[var(--surface-hover)]"
        style={{ background: "var(--surface)" }}>
        {title}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && <div className="px-4 py-4 border-t" style={{ borderColor: "var(--border)" }}>{children}</div>}
    </div>
  );
}

export function ProfileCustomizeEditor({ user }: { user: ProfileUser }) {
  const router = useRouter();
  const bgInputRef = useRef<HTMLInputElement>(null);
  const isPlus = (user.subscription_tier || "free") === "plus";

  const [form, setForm] = useState({
    profile_status: user.profile_status ?? "",
    profile_theme: user.profile_theme ?? "default",
    profile_background_color: user.profile_background_color ?? "",
    profile_accent_color: user.profile_accent_color ?? "",
    profile_background_url: user.profile_background_url ?? "",
    profile_font: user.profile_font ?? "default",
    profile_layout: user.profile_layout ?? "classic",
    profile_music: user.profile_music ?? "",
    profile_html: user.profile_html ?? "",
    profile_css: user.profile_css ?? "",
  });

  const [widgetOrder, setWidgetOrder] = useState<string[]>(
    (user.profile_widgets as { order?: string[] })?.order ?? DEFAULT_WIDGET_ORDER
  );

  const [saving, setSaving] = useState(false);
  const [uploadingBg, setUploadingBg] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  function updateForm(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setStatus("idle");
  }

  function selectTheme(themeId: string) {
    const theme = PROFILE_THEMES.find((t) => t.id === themeId);
    setForm((f) => ({
      ...f,
      profile_theme: themeId,
      profile_background_color: theme?.vars["--profile-bg"] ?? "",
      profile_accent_color: theme?.vars["--profile-accent"] ?? "",
      profile_font: theme?.defaultFont ?? "default",
    }));
    setStatus("idle");
  }

  async function handleBackgroundUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;

    setUploadingBg(true);
    try {
      const dataUri = await resizeBackgroundImage(file, 1920, 0.7);
      // Upload immediately
      const res = await fetch("/api/me/background", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUri }),
      });
      if (res.ok) {
        setForm((f) => ({ ...f, profile_background_url: dataUri }));
      } else {
        const data = await res.json();
        setErrorMsg(data.error ?? "Failed to upload background");
        setStatus("error");
      }
    } catch {
      setErrorMsg("Failed to process image");
      setStatus("error");
    } finally {
      setUploadingBg(false);
      if (bgInputRef.current) bgInputRef.current.value = "";
    }
  }

  function removeBackground() {
    setForm((f) => ({ ...f, profile_background_url: "" }));
  }

  function moveWidget(index: number, direction: "up" | "down") {
    const newOrder = [...widgetOrder];
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= newOrder.length) return;
    [newOrder[index], newOrder[target]] = [newOrder[target], newOrder[index]];
    setWidgetOrder(newOrder);
    setStatus("idle");
  }

  const widgetLabels: Record<string, string> = {
    about: "About / Bio",
    entries: "Journal Entries",
    top_pals: "Top Pen Pals",
    guestbook: "Guestbook",
    music: "Now Playing",
    custom_html: "Custom HTML",
  };

  async function handleSave() {
    setSaving(true);
    setStatus("idle");

    try {
      // 1. Save main profile fields
      const mainRes = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile_status: form.profile_status || null,
          profile_theme: form.profile_theme || null,
          profile_background_color: form.profile_background_color || null,
          profile_accent_color: form.profile_accent_color || null,
          profile_font: form.profile_font || null,
          profile_layout: form.profile_layout || null,
          profile_music: form.profile_music || null,
          profile_widgets: { order: widgetOrder },
          // Clear background if removed
          ...(form.profile_background_url === "" && user.profile_background_url
            ? { avatar_url: undefined } // handled separately
            : {}),
        }),
      });

      if (!mainRes.ok) {
        const data = await mainRes.json();
        setErrorMsg(data.error ?? "Failed to save");
        setStatus("error");
        setSaving(false);
        return;
      }

      // 2. Save HTML/CSS if Plus (separate endpoint)
      if (isPlus && (form.profile_html !== (user.profile_html ?? "") || form.profile_css !== (user.profile_css ?? ""))) {
        const profileRes = await fetch("/api/me/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profile_html: form.profile_html || null,
            profile_css: form.profile_css || null,
          }),
        });

        if (!profileRes.ok) {
          const data = await profileRes.json();
          setErrorMsg(data.error ?? "Failed to save custom HTML/CSS");
          setStatus("error");
          setSaving(false);
          return;
        }
      }

      // 3. Clear background image if removed
      if (form.profile_background_url === "" && user.profile_background_url) {
        await fetch("/api/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profile_background_url: null }),
        });
      }

      setStatus("success");
      router.refresh();
    } catch {
      setErrorMsg("Network error — please try again");
      setStatus("error");
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "w-full rounded-lg border px-3 py-2 text-sm bg-transparent outline-none focus:ring-2 focus:ring-[var(--accent)] transition";
  const inputStyle = { borderColor: "var(--border)" };

  return (
    <div className="flex flex-col gap-4">
      {/* Status Message */}
      <Section title="Status Message" defaultOpen={true}>
        <div className="flex flex-col gap-1.5">
          <input
            type="text"
            value={form.profile_status}
            onChange={(e) => updateForm("profile_status", e.target.value)}
            placeholder="What are you up to? e.g. reading Dune, listening to Radiohead..."
            maxLength={280}
            className={inputClass}
            style={inputStyle}
          />
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Shows on your profile like an away message ({form.profile_status.length}/280)
          </p>
        </div>
      </Section>

      {/* Theme Presets */}
      <Section title="Theme" defaultOpen={true}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {PROFILE_THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => selectTheme(t.id)}
              className="rounded-lg border p-2 text-left transition-all hover:scale-[1.02]"
              style={{
                borderColor: form.profile_theme === t.id ? "var(--accent)" : "var(--border)",
                borderWidth: form.profile_theme === t.id ? 2 : 1,
              }}>
              <div className="h-6 rounded mb-1.5" style={{ background: t.preview }} />
              <p className="text-xs font-medium truncate">{t.name}</p>
            </button>
          ))}
        </div>
      </Section>

      {/* Colors */}
      <Section title="Colors" defaultOpen={false}>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium" style={{ color: "var(--muted)" }}>Background</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.profile_background_color || "#ffffff"}
                onChange={(e) => updateForm("profile_background_color", e.target.value)}
                className="w-8 h-8 rounded border cursor-pointer"
                style={{ borderColor: "var(--border)" }}
              />
              <input
                type="text"
                value={form.profile_background_color}
                onChange={(e) => updateForm("profile_background_color", e.target.value)}
                placeholder="#ffffff"
                maxLength={7}
                className={`${inputClass} flex-1`}
                style={inputStyle}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium" style={{ color: "var(--muted)" }}>Accent</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.profile_accent_color || "#6366f1"}
                onChange={(e) => updateForm("profile_accent_color", e.target.value)}
                className="w-8 h-8 rounded border cursor-pointer"
                style={{ borderColor: "var(--border)" }}
              />
              <input
                type="text"
                value={form.profile_accent_color}
                onChange={(e) => updateForm("profile_accent_color", e.target.value)}
                placeholder="#6366f1"
                maxLength={7}
                className={`${inputClass} flex-1`}
                style={inputStyle}
              />
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => { updateForm("profile_background_color", ""); updateForm("profile_accent_color", ""); }}
          className="text-xs mt-2"
          style={{ color: "var(--muted)" }}>
          Reset to theme defaults
        </button>
      </Section>

      {/* Background Image */}
      <Section title="Background Image" defaultOpen={false}>
        {form.profile_background_url ? (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg overflow-hidden border h-32" style={{ borderColor: "var(--border)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={form.profile_background_url}
                alt="Background preview"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => bgInputRef.current?.click()}
                disabled={uploadingBg}
                className="text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors"
                style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>
                Change
              </button>
              <button
                type="button"
                onClick={removeBackground}
                className="text-sm px-3 py-1.5 rounded-lg border transition-colors"
                style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-4">
            <button
              type="button"
              onClick={() => bgInputRef.current?.click()}
              disabled={uploadingBg}
              className="text-sm font-medium px-4 py-2 rounded-lg border transition-colors disabled:opacity-50"
              style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>
              {uploadingBg ? "Uploading..." : "Upload background image"}
            </button>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Recommended: at least 1920px wide
            </p>
          </div>
        )}
        <input
          ref={bgInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          onChange={handleBackgroundUpload}
          className="hidden"
        />
      </Section>

      {/* Font */}
      <Section title="Font" defaultOpen={false}>
        <select
          value={form.profile_font}
          onChange={(e) => updateForm("profile_font", e.target.value)}
          className={inputClass}
          style={inputStyle}>
          {PROFILE_FONTS.map((f) => (
            <option key={f.id} value={f.id} style={{ fontFamily: f.family }}>
              {f.name}
            </option>
          ))}
        </select>
        <p className="text-sm mt-2 py-2 px-3 rounded-lg border" style={{
          fontFamily: PROFILE_FONTS.find((f) => f.id === form.profile_font)?.family,
          borderColor: "var(--border)",
        }}>
          The quick brown fox jumps over the lazy dog
        </p>
      </Section>

      {/* Layout */}
      <Section title="Layout" defaultOpen={false}>
        <div className="grid grid-cols-2 gap-2">
          {PROFILE_LAYOUTS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => updateForm("profile_layout", l.id)}
              className="rounded-lg border p-3 text-left transition-all"
              style={{
                borderColor: form.profile_layout === l.id ? "var(--accent)" : "var(--border)",
                borderWidth: form.profile_layout === l.id ? 2 : 1,
              }}>
              <p className="text-sm font-medium">{l.name}</p>
              <p className="text-xs" style={{ color: "var(--muted)" }}>{l.description}</p>
            </button>
          ))}
        </div>
      </Section>

      {/* Profile Music */}
      <Section title="Profile Music" defaultOpen={false}>
        <div className="flex flex-col gap-3">
          <input
            type="url"
            value={form.profile_music}
            onChange={(e) => updateForm("profile_music", e.target.value)}
            placeholder="Paste a Spotify, YouTube, or Apple Music URL"
            className={inputClass}
            style={inputStyle}
          />
          {form.profile_music && parseMusicUrl(form.profile_music) && (
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)" }}>
              <MusicPlayer music={form.profile_music} />
            </div>
          )}
          {form.profile_music && !parseMusicUrl(form.profile_music) && (
            <p className="text-xs" style={{ color: "var(--danger)" }}>
              URL not recognized. Supported: Spotify, YouTube, Apple Music
            </p>
          )}
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Visitors will see a music player on your profile
          </p>
        </div>
      </Section>

      {/* Widget Ordering */}
      <Section title="Profile Sections Order" defaultOpen={false}>
        <div className="flex flex-col gap-1">
          {widgetOrder.map((widget, i) => (
            <div key={widget} className="flex items-center gap-2 py-1.5 px-3 rounded-lg border"
              style={{ borderColor: "var(--border)" }}>
              <span className="text-xs font-mono" style={{ color: "var(--muted)" }}>{i + 1}</span>
              <span className="flex-1 text-sm">{widgetLabels[widget] ?? widget}</span>
              <button
                type="button"
                onClick={() => moveWidget(i, "up")}
                disabled={i === 0}
                className="p-1 rounded disabled:opacity-20 hover:bg-[var(--surface-hover)] transition-colors"
                aria-label="Move up">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="18 15 12 9 6 15" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => moveWidget(i, "down")}
                disabled={i === widgetOrder.length - 1}
                className="p-1 rounded disabled:opacity-20 hover:bg-[var(--surface-hover)] transition-colors"
                aria-label="Move down">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </Section>

      {/* Custom CSS */}
      <Section title="Custom CSS" defaultOpen={false}>
        {isPlus ? (
          <div className="flex flex-col gap-2">
            <textarea
              value={form.profile_css}
              onChange={(e) => updateForm("profile_css", e.target.value)}
              placeholder={`.profile-header {\n  background: linear-gradient(45deg, #ff6b6b, #4ecdc4);\n}`}
              rows={8}
              className={`${inputClass} font-mono text-xs`}
              style={inputStyle}
            />
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              CSS is scoped to your profile — it won&apos;t affect the rest of the site
            </p>
          </div>
        ) : (
          <div className="text-center py-6">
            <p className="text-sm mb-2" style={{ color: "var(--muted)" }}>Custom CSS requires Plus</p>
            <a href="/settings/billing" className="text-sm font-medium" style={{ color: "var(--accent)" }}>
              Upgrade to Plus
            </a>
          </div>
        )}
      </Section>

      {/* Custom HTML */}
      <Section title="Custom HTML" defaultOpen={false}>
        {isPlus ? (
          <div className="flex flex-col gap-2">
            <textarea
              value={form.profile_html}
              onChange={(e) => updateForm("profile_html", e.target.value)}
              placeholder={`<div class="custom-section">\n  <h3>About My Journal</h3>\n  <p>Welcome to my corner of the web!</p>\n</div>`}
              rows={8}
              className={`${inputClass} font-mono text-xs`}
              style={inputStyle}
            />
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Allowed: most HTML tags, CSS animations, custom classes. No scripts, iframes, or event handlers.
            </p>
          </div>
        ) : (
          <div className="text-center py-6">
            <p className="text-sm mb-2" style={{ color: "var(--muted)" }}>Custom HTML requires Plus</p>
            <a href="/settings/billing" className="text-sm font-medium" style={{ color: "var(--accent)" }}>
              Upgrade to Plus
            </a>
          </div>
        )}
      </Section>

      {/* Save Button */}
      <div className="flex items-center gap-4 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg px-5 py-2 text-sm font-medium disabled:opacity-60 transition"
          style={{ background: "var(--accent)", color: "#fff" }}>
          {saving ? "Saving..." : "Save changes"}
        </button>
        {status === "success" && (
          <span className="text-sm font-medium" style={{ color: "var(--success)" }}>Saved</span>
        )}
        {status === "error" && (
          <span className="text-sm" style={{ color: "var(--danger)" }}>{errorMsg}</span>
        )}
        <a href={`/${user.username}`} className="text-sm ml-auto" style={{ color: "var(--accent)" }}>
          View profile →
        </a>
      </div>
    </div>
  );
}
