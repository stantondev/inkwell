"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function WelcomePage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Check username availability with debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!username.trim() || username.length < 3) {
      setUsernameAvailable(null);
      return;
    }

    // Validate format client-side first
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      // Update username if provided
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

      // Update profile + mark onboarded
      const profileRes = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(displayName.trim() ? { display_name: displayName.trim() } : {}),
          ...(bio.trim() ? { bio: bio.trim() } : {}),
          ...(avatarUrl.trim() ? { avatar_url: avatarUrl.trim() } : {}),
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
      setError("Network error - please try again");
      setSaving(false);
    }
  }

  function handleSkip() {
    // Mark as onboarded and go to feed
    fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: { onboarded: true } }),
    }).then(() => router.push("/feed")).catch(() => router.push("/feed"));
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
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
            Set up your profile to get started. You can always change these later.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl border p-6"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <div className="flex flex-col gap-5">
            {/* Username */}
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
                  className="w-full rounded-lg border px-3 py-2 pl-7 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--foreground)" }}
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

            {/* Display Name */}
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
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--foreground)" }}
              />
            </div>

            {/* Avatar URL */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                Avatar URL <span className="normal-case font-normal">(optional)</span>
              </label>
              <input
                type="url"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://example.com/your-photo.jpg"
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--foreground)" }}
              />
              {avatarUrl && (
                <div className="flex items-center gap-3 mt-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={avatarUrl} alt="Preview" width={40} height={40}
                    className="rounded-full object-cover"
                    style={{ width: 40, height: 40 }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  <span className="text-xs" style={{ color: "var(--muted)" }}>Preview</span>
                </div>
              )}
            </div>

            {/* Bio */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                Bio <span className="normal-case font-normal">(optional)</span>
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell people about yourself..."
                maxLength={2000}
                rows={3}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-none"
                style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--foreground)" }}
              />
            </div>

            {error && (
              <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>
            )}

            <div className="flex items-center justify-between gap-4 pt-2">
              <button type="button" onClick={handleSkip}
                className="text-sm transition-colors hover:underline"
                style={{ color: "var(--muted)" }}>
                Skip for now
              </button>
              <button type="submit" disabled={saving || (username.length >= 3 && usernameAvailable === false)}
                className="rounded-full px-6 py-2.5 text-sm font-medium transition-opacity disabled:opacity-40"
                style={{ background: "var(--accent)", color: "#fff" }}>
                {saving ? "Saving..." : "Get started"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
