"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { resizeImage } from "@/lib/image-utils";
import { PROFILE_THEMES } from "@/lib/profile-themes";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const TOTAL_STEPS = 4;

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className="rounded-full transition-all duration-300"
          style={{
            width: i === current ? 24 : 8,
            height: 8,
            background: i === current ? "var(--accent)" : i < current ? "var(--accent)" : "var(--border)",
            opacity: i < current ? 0.5 : 1,
          }}
        />
      ))}
    </div>
  );
}

function AvatarPreview({ url, name, size = 96 }: { url: string | null; name: string; size?: number }) {
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img src={url} alt={name} width={size} height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }} />
    );
  }
  return (
    <div className="rounded-full flex items-center justify-center font-semibold select-none"
      style={{
        width: size, height: size,
        background: "var(--accent-light)", color: "var(--accent)",
        fontSize: size * 0.32,
      }}
      aria-label={name}>
      {initials}
    </div>
  );
}

export default function WelcomePage() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  // Step 1: Username & Display Name
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Step 2: Photo & Pronouns
  const [avatarDataUri, setAvatarDataUri] = useState<string | null>(null);
  const [pronouns, setPronouns] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 3: Bio & Status
  const [bio, setBio] = useState("");
  const [status, setStatus] = useState("");

  // Step 4: Theme
  const [theme, setTheme] = useState("default");

  // General
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Username availability check
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!username.trim() || username.length < 3) {
      setUsernameAvailable(null);
      return;
    }
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
      setUsernameAvailable(false);
      return;
    }
    setCheckingUsername(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/api/username-available?username=${encodeURIComponent(username)}`);
        if (res.ok) {
          const data = await res.json();
          setUsernameAvailable(data.available);
        }
      } catch {
        // ignore
      } finally {
        setCheckingUsername(false);
      }
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [username]);

  async function handleAvatarSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;

    setUploading(true);
    try {
      const dataUri = await resizeImage(file, 400, 0.85);
      setAvatarDataUri(dataUri);
    } catch {
      setError("Failed to process image");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleFinish() {
    setSaving(true);
    setError("");

    try {
      // 1. Set username if provided
      if (username.trim()) {
        const usernameRes = await fetch("/api/me/username", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: username.trim() }),
        });
        if (!usernameRes.ok) {
          const data = await usernameRes.json();
          setError(data.errors?.username?.[0] ?? data.error ?? "Could not set username");
          setSaving(false);
          return;
        }
      }

      // 2. Upload avatar if selected
      if (avatarDataUri) {
        const avatarRes = await fetch("/api/me/avatar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: avatarDataUri }),
        });
        if (!avatarRes.ok) {
          // Non-fatal — continue with other updates
          console.warn("Avatar upload failed");
        }
      }

      // 3. Update profile fields + mark onboarded
      const profileRes = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(displayName.trim() ? { display_name: displayName.trim() } : {}),
          ...(bio.trim() ? { bio: bio.trim() } : {}),
          ...(pronouns.trim() ? { pronouns: pronouns.trim() } : {}),
          ...(status.trim() ? { profile_status: status.trim() } : {}),
          ...(theme !== "default" ? { profile_theme: theme } : {}),
          settings: { onboarded: true },
        }),
      });

      if (!profileRes.ok) {
        const data = await profileRes.json();
        setError(data.error ?? "Could not save profile");
        setSaving(false);
        return;
      }

      router.push("/feed");
    } catch {
      setError("Network error — please try again");
      setSaving(false);
    }
  }

  function handleSkip() {
    fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: { onboarded: true } }),
    }).then(() => router.push("/feed")).catch(() => router.push("/feed"));
  }

  function nextStep() {
    if (step < TOTAL_STEPS - 1) setStep(step + 1);
  }
  function prevStep() {
    if (step > 0) setStep(step - 1);
  }

  const canProceedStep0 = !username.trim() || (username.length >= 3 && usernameAvailable !== false);

  const inputClass = "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]";
  const inputStyle = { borderColor: "var(--border)", background: "var(--background)", color: "var(--foreground)" };

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
              style={{ color: "var(--accent)" }} aria-hidden="true">
              <path d="M17.5 2.5L21.5 6.5L10 18H6V14L17.5 2.5Z" stroke="currentColor"
                strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M14 6L18 10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
              <path d="M6 18L2.5 21.5" stroke="currentColor" strokeWidth="1.75"
                strokeLinecap="round" strokeOpacity="0.5"/>
            </svg>
            <span className="font-semibold text-xl tracking-tight"
              style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
              inkwell
            </span>
          </div>
          <h1 className="text-2xl font-semibold mb-2"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
            Welcome to Inkwell
          </h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {step === 0 && "Choose your identity"}
            {step === 1 && "Add a photo and pronouns"}
            {step === 2 && "Tell people about yourself"}
            {step === 3 && "Pick your vibe"}
          </p>
        </div>

        <StepDots current={step} total={TOTAL_STEPS} />

        <div className="rounded-2xl border p-6"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}>

          {/* Step 1: Username & Display Name */}
          {step === 0 && (
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                  Username
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: "var(--muted)" }}>@</span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                    placeholder="your_username"
                    maxLength={30}
                    className={`${inputClass} pl-7`}
                    style={inputStyle}
                  />
                  {username.length >= 3 && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs">
                      {checkingUsername ? (
                        <span style={{ color: "var(--muted)" }}>checking...</span>
                      ) : usernameAvailable === true ? (
                        <span style={{ color: "var(--success)" }}>available</span>
                      ) : usernameAvailable === false ? (
                        <span style={{ color: "var(--danger)" }}>taken</span>
                      ) : null}
                    </span>
                  )}
                </div>
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  3-30 characters, letters, numbers, and underscores only
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                  Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="How you want to be known"
                  maxLength={100}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
            </div>
          )}

          {/* Step 2: Photo & Pronouns */}
          {step === 1 && (
            <div className="flex flex-col gap-5">
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide mb-3" style={{ color: "var(--muted)" }}>
                  Profile Photo
                </label>
                <div className="flex flex-col items-center gap-3">
                  <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                    <AvatarPreview url={avatarDataUri} name={displayName || username || "?"} size={96} />
                    <div className="absolute inset-0 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ background: "rgba(0,0,0,0.5)" }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white"
                        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                        <circle cx="12" cy="13" r="4"/>
                      </svg>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="text-sm font-medium px-4 py-1.5 rounded-lg border transition-colors disabled:opacity-50"
                    style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>
                    {uploading ? "Processing..." : avatarDataUri ? "Change photo" : "Choose photo"}
                  </button>
                  {avatarDataUri && (
                    <button
                      type="button"
                      onClick={() => setAvatarDataUri(null)}
                      className="text-xs"
                      style={{ color: "var(--muted)" }}>
                      Remove
                    </button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    onChange={handleAvatarSelect}
                    className="hidden"
                  />
                  <p className="text-xs text-center" style={{ color: "var(--muted)" }}>
                    Any size works — it will be cropped and resized automatically
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                  Pronouns <span className="normal-case font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={pronouns}
                  onChange={(e) => setPronouns(e.target.value)}
                  placeholder="e.g. she/her, they/them, he/him"
                  maxLength={40}
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
            </div>
          )}

          {/* Step 3: Bio & Status */}
          {step === 2 && (
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                  Bio <span className="normal-case font-normal">(optional)</span>
                </label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell people about yourself..."
                  maxLength={2000}
                  rows={4}
                  className={`${inputClass} resize-none`}
                  style={inputStyle}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                  Status <span className="normal-case font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  placeholder="What are you up to? e.g. reading Dune, listening to Radiohead"
                  maxLength={280}
                  className={inputClass}
                  style={inputStyle}
                />
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  Shows on your profile like an away message
                </p>
              </div>
            </div>
          )}

          {/* Step 4: Theme */}
          {step === 3 && (
            <div className="flex flex-col gap-4">
              <label className="block text-xs font-medium uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                Choose a theme for your profile
              </label>
              <div className="grid grid-cols-2 gap-3">
                {PROFILE_THEMES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTheme(t.id)}
                    className="rounded-xl border p-3 text-left transition-all"
                    style={{
                      borderColor: theme === t.id ? "var(--accent)" : "var(--border)",
                      borderWidth: theme === t.id ? 2 : 1,
                      background: "var(--background)",
                    }}>
                    <div className="h-8 rounded-lg mb-2" style={{ background: t.preview }} />
                    <p className="text-sm font-medium">{t.name}</p>
                    <p className="text-xs" style={{ color: "var(--muted)" }}>{t.description}</p>
                  </button>
                ))}
              </div>
              <p className="text-xs text-center" style={{ color: "var(--muted)" }}>
                You can customize colors, fonts, and more in Settings later
              </p>
            </div>
          )}

          {error && (
            <p className="text-sm mt-4" style={{ color: "var(--danger)" }}>{error}</p>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between gap-4 pt-5 mt-5 border-t" style={{ borderColor: "var(--border)" }}>
            <div>
              {step === 0 ? (
                <button type="button" onClick={handleSkip}
                  className="text-sm transition-colors hover:underline"
                  style={{ color: "var(--muted)" }}>
                  Skip for now
                </button>
              ) : (
                <button type="button" onClick={prevStep}
                  className="text-sm transition-colors hover:underline"
                  style={{ color: "var(--muted)" }}>
                  Back
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              {step < TOTAL_STEPS - 1 && step > 0 && (
                <button type="button" onClick={handleSkip}
                  className="text-xs transition-colors hover:underline"
                  style={{ color: "var(--muted)" }}>
                  Skip all
                </button>
              )}
              {step < TOTAL_STEPS - 1 ? (
                <button
                  type="button"
                  onClick={nextStep}
                  disabled={!canProceedStep0 && step === 0}
                  className="rounded-full px-6 py-2.5 text-sm font-medium transition-opacity disabled:opacity-40"
                  style={{ background: "var(--accent)", color: "#fff" }}>
                  Next
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleFinish}
                  disabled={saving}
                  className="rounded-full px-6 py-2.5 text-sm font-medium transition-opacity disabled:opacity-40"
                  style={{ background: "var(--accent)", color: "#fff" }}>
                  {saving ? "Saving..." : "Get started"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
