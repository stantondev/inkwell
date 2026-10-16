"use client";

import Link from "next/link";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { PROFILE_THEMES, PROFILE_FONTS } from "@/lib/profile-themes";
import { resizeBackgroundImage } from "@/lib/image-utils";
import { parseMusicUrl } from "@/lib/music";
import { MusicPlayer } from "@/components/music-player";
import { AvatarWithFrame } from "@/components/avatar-with-frame";
import { PROFILE_EFFECTS, EFFECT_INTENSITIES } from "@/lib/profile-effects-config";
import { ProfileEffects } from "@/components/profile-effects";
import { usePlusTrial } from "@/hooks/use-plus-trial";
import { HtmlEditor } from "./html-editor";

interface ProfileUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  avatar_frame?: string | null;
  avatar_animation?: string | null;
  profile_effect?: string | null;
  profile_effect_intensity?: string | null;
  subscription_tier?: string;
  profile_html?: string | null;
  profile_css?: string | null;
  profile_music?: string | null;
  profile_background_url?: string | null;
  profile_banner_url?: string | null;
  profile_background_color?: string | null;
  profile_accent_color?: string | null;
  profile_foreground_color?: string | null;
  profile_font?: string | null;
  profile_layout?: string | null;
  profile_widgets?: Record<string, unknown> | null;
  profile_status?: string | null;
  profile_theme?: string | null;
  profile_entry_display?: string | null;
  pinned_entry_ids?: string[];
  social_links?: Record<string, string> | null;
  settings?: { entries_per_page?: Record<string, number>; [key: string]: unknown } | null;
}


const PLUS_GATE_COPY: Record<string, { headline: string; detail: string }> = {
  "Custom colors": {
    headline: "Make it yours.",
    detail: "Set custom background, text, and accent colors beyond themes.",
  },
  "Background images": {
    headline: "Set the scene.",
    detail: "Upload a background image that makes your profile uniquely you.",
  },
  "Custom fonts": {
    headline: "Find your voice.",
    detail: "Choose from 8 fonts to give your journal a distinctive feel.",
  },
  "Custom layouts": {
    headline: "Change your layout.",
    detail: "Wide, minimal, or magazine views for your entries.",
  },
  "Profile music": {
    headline: "Set the mood.",
    detail: "Add a Spotify or YouTube track as your profile's soundtrack.",
  },
  "Widget ordering": {
    headline: "Arrange your space.",
    detail: "Drag and drop sidebar sections into your preferred order.",
  },
  "Custom HTML & CSS": {
    headline: "Full creative control.",
    detail: "Write custom HTML and CSS, just like the early web.",
  },
};

function PlusGate({ feature }: { feature: string }) {
  const copy = PLUS_GATE_COPY[feature];
  const trial = usePlusTrial();
  return (
    <div className="text-center py-6">
      {copy ? (
        <>
          <p
            className="text-sm font-medium mb-1"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)", fontStyle: "italic" }}
          >
            {copy.headline}
          </p>
          <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>
            {copy.detail}
          </p>
        </>
      ) : (
        <p className="text-sm mb-2" style={{ color: "var(--muted)" }}>{feature} requires Plus</p>
      )}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {trial.eligible && (
          <button
            type="button"
            onClick={trial.start}
            disabled={trial.starting}
            className="inline-block rounded-full px-4 py-1.5 text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {trial.starting ? "Starting…" : `Try free for ${trial.days} days`}
          </button>
        )}
        <a
          href="/settings/billing"
          className="inline-block rounded-full px-4 py-1.5 text-xs font-medium transition-opacity hover:opacity-80"
          style={
            trial.eligible
              ? { border: "1px solid var(--accent)", color: "var(--accent)" }
              : { background: "var(--accent)", color: "#fff" }
          }
        >
          Upgrade to Plus &middot; $5/mo
        </a>
      </div>
      {trial.eligible && (
        <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>No card needed. Ends on its own.</p>
      )}
      {trial.error && <p className="text-xs mt-2" style={{ color: "var(--danger)" }}>{trial.error}</p>}
    </div>
  );
}

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border rounded-xl overflow-hidden" style={{ borderColor: "var(--border)" }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-left transition-colors hover:bg-[var(--surface-hover)]"
        style={{ background: "var(--surface)" }}>
        <span className="flex items-center gap-2">{title}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="px-4 py-4 border-t" style={{ borderColor: "var(--border)" }}>
          {children}
        </div>
      )}
    </div>
  );
}

export function ProfileCustomizeEditor({ user }: { user: ProfileUser }) {
  // Connected ListenBrainz and showing it on the profile (Settings → Listening).
  const listeningShown =
    typeof user.settings?.listenbrainz_username === "string" && user.settings?.listenbrainz_on_profile !== false
      ? (user.settings.listenbrainz_username as string)
      : null;
  const router = useRouter();
  const bgInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const isPlus = (user.subscription_tier || "free") === "plus";

  const [form, setForm] = useState({
    profile_effect: user.profile_effect ?? "none",
    profile_effect_intensity: user.profile_effect_intensity ?? "subtle",
    profile_status: user.profile_status ?? "",
    profile_theme: user.profile_theme ?? "default",
    profile_background_color: user.profile_background_color ?? "",
    profile_accent_color: user.profile_accent_color ?? "",
    profile_foreground_color: user.profile_foreground_color ?? "",
    profile_background_url: user.profile_background_url ?? "",
    profile_banner_url: user.profile_banner_url ?? "",
    profile_font: user.profile_font ?? "default",
    profile_music: user.profile_music ?? "",
    profile_html: user.profile_html ?? "",
    profile_css: user.profile_css ?? "",
    profile_entry_display: user.profile_entry_display ?? "cards",
  });

  const PER_PAGE_OPTIONS: Record<string, number[]> = {
    full: [1, 3, 5, 10],
    cards: [6, 9, 12, 18],
    preview: [10, 20, 30, 50],
  };
  const PER_PAGE_DEFAULTS: Record<string, number> = { full: 5, cards: 9, preview: 20 };

  const [entriesPerPage, setEntriesPerPage] = useState<Record<string, number>>(() => {
    const saved = (user as { settings?: { entries_per_page?: Record<string, number> } }).settings?.entries_per_page;
    return saved ?? {};
  });

  const currentMode = form.profile_entry_display || "cards";
  const currentPerPage = entriesPerPage[currentMode] ?? PER_PAGE_DEFAULTS[currentMode] ?? 9;

  const [saving, setSaving] = useState(false);
  const [uploadingBg, setUploadingBg] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
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
      profile_foreground_color: theme?.vars["--profile-foreground"] ?? "",
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

  async function handleBannerUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;

    setUploadingBanner(true);
    try {
      const dataUri = await resizeBackgroundImage(file, 1500, 0.8);
      const res = await fetch("/api/me/banner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUri }),
      });
      if (res.ok) {
        setForm((f) => ({ ...f, profile_banner_url: dataUri }));
      } else {
        const data = await res.json();
        setErrorMsg(data.error ?? "Failed to upload banner");
        setStatus("error");
      }
    } catch {
      setErrorMsg("Failed to process image");
      setStatus("error");
    } finally {
      setUploadingBanner(false);
      if (bannerInputRef.current) bannerInputRef.current.value = "";
    }
  }

  function removeBanner() {
    setForm((f) => ({ ...f, profile_banner_url: "" }));
  }

  async function handleSave() {
    setSaving(true);
    setStatus("idle");

    try {
      // 1. Save main profile fields (free-tier fields always, Plus fields only if Plus)
      // Only save entries_per_page values that differ from defaults
      const eppToSave: Record<string, number> = {};
      for (const [mode, val] of Object.entries(entriesPerPage)) {
        if (val !== PER_PAGE_DEFAULTS[mode]) {
          eppToSave[mode] = val;
        }
      }

      const mainBody: Record<string, unknown> = {
        profile_status: form.profile_status || null,
        profile_theme: form.profile_theme || null,
        profile_banner_url: form.profile_banner_url || null,
        profile_entry_display: form.profile_entry_display || "cards",
        settings: { entries_per_page: Object.keys(eppToSave).length > 0 ? eppToSave : null },
      };

      if (isPlus) {
        Object.assign(mainBody, {
          profile_effect: form.profile_effect === "none" ? null : form.profile_effect,
          profile_effect_intensity: form.profile_effect === "none" ? null : form.profile_effect_intensity,
          profile_background_color: form.profile_background_color || null,
          profile_accent_color: form.profile_accent_color || null,
          profile_foreground_color: form.profile_foreground_color || null,
          profile_font: form.profile_font || null,
          profile_music: form.profile_music || null,
        });
      }

      const mainRes = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mainBody),
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

      // 3. Clear background image if removed (Plus users only)
      if (isPlus && form.profile_background_url === "" && user.profile_background_url) {
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
      <Link
        href="/arrange"
        className="rounded-xl border p-4 flex items-center justify-between gap-3 transition-colors hover:border-[var(--accent)]"
        style={{ borderColor: "var(--accent)", background: "var(--surface)" }}
      >
        <span className="text-sm">
          <span className="font-medium">Arrange your page</span>
          <span className="block text-xs" style={{ color: "var(--muted)" }}>
            Move things around, add notes, photos, quotes and more, and choose a layout. Free for everyone.
          </span>
        </span>
        <span className="text-sm whitespace-nowrap" style={{ color: "var(--accent)" }}>Arrange →</span>
      </Link>

      <Link
        href="/settings/avatar"
        className="rounded-xl border p-4 flex items-center justify-between gap-3 transition-colors hover:border-[var(--accent)]"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <span className="flex items-center gap-3">
          <AvatarWithFrame
            url={user.avatar_url}
            name={user.display_name}
            size={40}
            frame={user.avatar_frame}
            animation={user.avatar_animation}
            subscriptionTier={user.subscription_tier}
          />
          <span className="text-sm">
            <span className="font-medium">Avatar frames and animations</span>
            <span className="block text-xs" style={{ color: "var(--muted)" }}>
              Now on the Avatar page, next to your picture.
            </span>
          </span>
        </span>
        <span className="text-sm whitespace-nowrap" style={{ color: "var(--accent)" }}>Avatar →</span>
      </Link>

      {/* Profile Effects (Plus only) */}
      <Section title="Profile Effects" defaultOpen={false}>
        {!isPlus ? (
          <div className="text-center py-3">
            <p className="text-xs mb-2" style={{ color: "var(--muted)" }}>
              Ambient particle effects are a Plus feature.
            </p>
            <span className="text-xs font-medium" style={{ color: "var(--accent)" }}>
              ✦ Upgrade to Plus
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Live preview */}
            {form.profile_effect !== "none" && (
              <div
                className="relative rounded-lg border overflow-hidden"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--surface)",
                  height: 200,
                }}
                data-profile-wrapper
              >
                <ProfileEffects
                  effect={form.profile_effect}
                  intensity={form.profile_effect_intensity}
                  preview
                />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    Live Preview
                  </span>
                </div>
              </div>
            )}

            {/* Effect grid (None + 10 effects) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {/* None option */}
              <button
                type="button"
                onClick={() => updateForm("profile_effect", "none")}
                className="rounded-lg border p-3 flex flex-col items-center gap-1 transition-all hover:scale-[1.02]"
                style={{
                  borderColor: form.profile_effect === "none" ? "var(--accent)" : "var(--border)",
                  borderWidth: form.profile_effect === "none" ? 2 : 1,
                  cursor: "pointer",
                }}
              >
                <span className="text-xs font-medium">None</span>
                <span className="text-[10px]" style={{ color: "var(--muted)" }}>No effects</span>
              </button>

              {PROFILE_EFFECTS.map((fx) => (
                <button
                  key={fx.id}
                  type="button"
                  onClick={() => updateForm("profile_effect", fx.id)}
                  className="rounded-lg border p-3 flex flex-col items-center gap-1 transition-all hover:scale-[1.02]"
                  style={{
                    borderColor: form.profile_effect === fx.id ? "var(--accent)" : "var(--border)",
                    borderWidth: form.profile_effect === fx.id ? 2 : 1,
                    cursor: "pointer",
                  }}
                >
                  <span className="text-xs font-medium">{fx.label}</span>
                  <span className="text-[10px] text-center leading-tight" style={{ color: "var(--muted)" }}>
                    {fx.description}
                  </span>
                </button>
              ))}
            </div>

            {/* Intensity selector (only when an effect is selected) */}
            {form.profile_effect !== "none" && (
              <div>
                <label className="block text-xs font-medium mb-2" style={{ color: "var(--muted)" }}>
                  Intensity
                </label>
                <div className="flex gap-2">
                  {EFFECT_INTENSITIES.map((i) => (
                    <button
                      key={i.id}
                      type="button"
                      onClick={() => updateForm("profile_effect_intensity", i.id)}
                      className="rounded-full px-4 py-1.5 text-xs font-medium transition-all"
                      style={{
                        background: form.profile_effect_intensity === i.id ? "var(--accent)" : "var(--surface)",
                        color: form.profile_effect_intensity === i.id ? "#fff" : "var(--foreground)",
                        border: `1px solid ${form.profile_effect_intensity === i.id ? "var(--accent)" : "var(--border)"}`,
                      }}
                    >
                      {i.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Section>

      {/* Banner Image */}
      <Section title="Banner Image" defaultOpen={false}>
        <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>
          A header image displayed at the top of your profile. Recommended: 1500&times;500px.
        </p>
        {form.profile_banner_url ? (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg overflow-hidden border h-24" style={{ borderColor: "var(--border)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={form.profile_banner_url} alt="Banner preview" className="w-full h-full object-cover" />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => bannerInputRef.current?.click()}
                className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
                style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
                {uploadingBanner ? "Uploading..." : "Change"}
              </button>
              <button type="button" onClick={removeBanner}
                className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
                style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => bannerInputRef.current?.click()}
            disabled={uploadingBanner}
            className="w-full rounded-lg border-2 border-dashed py-6 text-sm transition-colors hover:border-[var(--accent)] disabled:opacity-50"
            style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
            {uploadingBanner ? "Uploading..." : "Upload banner image"}
          </button>
        )}
        <input
          ref={bannerInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp"
          onChange={handleBannerUpload}
          className="hidden"
        />
      </Section>

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

      {/* Entry Display */}
      <Section title="Entry Display" defaultOpen={false}>
        <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>
          Choose how journal entries appear on your profile page.
        </p>
        <div className="flex flex-col gap-2">
          {([
            { id: "cards", label: "Cards", desc: "Visual grid with cover images, excerpts, and tags" },
            { id: "full", label: "Full Post", desc: "Complete entries with page-by-page navigation" },
            { id: "preview", label: "Timeline", desc: "Compact list with titles, dates, and one-line excerpts" },
          ] as const).map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => updateForm("profile_entry_display", mode.id)}
              className="flex items-start gap-3 rounded-lg border p-3 text-left transition-all hover:scale-[1.01]"
              style={{
                borderColor: form.profile_entry_display === mode.id ? "var(--accent)" : "var(--border)",
                borderWidth: form.profile_entry_display === mode.id ? 2 : 1,
              }}
            >
              <div
                className="w-4 h-4 mt-0.5 rounded-full border-2 shrink-0 flex items-center justify-center"
                style={{ borderColor: form.profile_entry_display === mode.id ? "var(--accent)" : "var(--border)" }}
              >
                {form.profile_entry_display === mode.id && (
                  <div className="w-2 h-2 rounded-full" style={{ background: "var(--accent)" }} />
                )}
              </div>
              <div>
                <p className="text-sm font-medium">{mode.label}</p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>{mode.desc}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Entries per page */}
        <div className="mt-4 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
          <label className="block text-xs font-medium mb-2" style={{ color: "var(--muted)" }}>
            Entries per page
          </label>
          <select
            value={currentPerPage}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              setEntriesPerPage((prev) => ({ ...prev, [currentMode]: val }));
              setStatus("idle");
            }}
            className={inputClass}
            style={inputStyle}
          >
            {(PER_PAGE_OPTIONS[currentMode] ?? [9]).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <p className="text-xs mt-1.5" style={{ color: "var(--muted)" }}>
            How many entries to show per page in {currentMode === "full" ? "Full Post" : currentMode === "preview" ? "Timeline" : "Cards"} mode.
          </p>
        </div>
      </Section>

      {/* Colors */}
      <Section title="Colors" defaultOpen={false}>
        {isPlus ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
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
                <label className="text-xs font-medium" style={{ color: "var(--muted)" }}>Text</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.profile_foreground_color || "#1c1917"}
                    onChange={(e) => updateForm("profile_foreground_color", e.target.value)}
                    className="w-8 h-8 rounded border cursor-pointer"
                    style={{ borderColor: "var(--border)" }}
                  />
                  <input
                    type="text"
                    value={form.profile_foreground_color}
                    onChange={(e) => updateForm("profile_foreground_color", e.target.value)}
                    placeholder="#1c1917"
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
                    value={form.profile_accent_color || "#2d4a8a"}
                    onChange={(e) => updateForm("profile_accent_color", e.target.value)}
                    className="w-8 h-8 rounded border cursor-pointer"
                    style={{ borderColor: "var(--border)" }}
                  />
                  <input
                    type="text"
                    value={form.profile_accent_color}
                    onChange={(e) => updateForm("profile_accent_color", e.target.value)}
                    placeholder="#2d4a8a"
                    maxLength={7}
                    className={`${inputClass} flex-1`}
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>
            {/* Color preview */}
            <div className="mt-3 rounded-lg border p-3" style={{
              background: form.profile_background_color || "var(--background)",
              borderColor: "var(--border)",
            }}>
              <p className="text-sm font-medium" style={{ color: form.profile_foreground_color || "var(--foreground)" }}>
                Preview text on your background
              </p>
              <p className="text-xs mt-1" style={{ color: form.profile_accent_color || "var(--accent)" }}>
                Accent color for links and buttons
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                updateForm("profile_background_color", "");
                updateForm("profile_accent_color", "");
                updateForm("profile_foreground_color", "");
              }}
              className="text-xs mt-2"
              style={{ color: "var(--muted)" }}>
              Reset to theme defaults
            </button>
          </>
        ) : (
          <PlusGate feature="Custom colors" />
        )}
      </Section>

      {/* Background Image */}
      <Section title="Background Image" defaultOpen={false}>
        {isPlus ? (
          <>
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
          </>
        ) : (
          <PlusGate feature="Background images" />
        )}
      </Section>

      {/* Font */}
      <Section title="Font" defaultOpen={false}>
        {isPlus ? (
          <>
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
          </>
        ) : (
          <PlusGate feature="Custom fonts" />
        )}
      </Section>

      {/* Profile Music */}
      <Section title="Profile Music" defaultOpen={false}>
        {listeningShown && (
          <p className="text-xs mb-3 rounded-lg border px-3 py-2" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
            Your profile shows what you&rsquo;re listening to on ListenBrainz ({listeningShown}).
            {isPlus ? " The song below shows when there's nothing recent there." : ""}{" "}
            <Link href="/settings/listening" className="underline">Change in Settings → Listening</Link>
          </p>
        )}
        {isPlus ? (
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
        ) : (
          <PlusGate feature="Profile music" />
        )}
      </Section>

      {/* Custom HTML & CSS */}
      <Section title="Custom HTML & CSS" defaultOpen={false}>
        {isPlus ? (
          <HtmlEditor
            html={form.profile_html}
            css={form.profile_css}
            onHtmlChange={(v) => updateForm("profile_html", v)}
            onCssChange={(v) => updateForm("profile_css", v)}
          />
        ) : (
          <PlusGate feature="Custom HTML & CSS" />
        )}
      </Section>

      {/* Save Button */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-4 pt-2">
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
