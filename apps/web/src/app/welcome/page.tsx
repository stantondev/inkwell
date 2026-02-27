"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { resizeImage } from "@/lib/image-utils";
import { PROFILE_THEMES } from "@/lib/profile-themes";
import { AvatarWithFrame } from "@/components/avatar-with-frame";
import { GuidelinesBook } from "@/components/guidelines-book";
const TOTAL_STEPS = 7;

type SuggestedUser = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
};

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

export default function WelcomePage() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  // Step 1: Username & Display Name
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const currentUsernameRef = useRef<string>("");  // tracks pre-existing username from DB

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

  // Step 5: Discover writers
  const [suggestedUsers, setSuggestedUsers] = useState<SuggestedUser[]>([]);
  const [loadingSuggested, setLoadingSuggested] = useState(false);
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());

  // General
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  // Pre-fill fields from existing user data (e.g. fediverse-derived username)
  useEffect(() => {
    fetch("/api/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const user = data?.data;
        if (!user) return;
        if (user.username) {
          setUsername(user.username);
          currentUsernameRef.current = user.username;
        }
        if (user.display_name && user.display_name !== user.username) setDisplayName(user.display_name);
        if (user.avatar_url) setAvatarDataUri(user.avatar_url);
        if (user.pronouns) setPronouns(user.pronouns);
        if (user.bio) setBio(user.bio);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // Fetch suggested writers when entering step 5
  useEffect(() => {
    if (step !== 5) return;
    setLoadingSuggested(true);
    fetch("/api/discover/writers")
      .then((r) => r.json())
      .then((data) => setSuggestedUsers(data.data ?? []))
      .catch(() => setSuggestedUsers([]))
      .finally(() => setLoadingSuggested(false));
  }, [step]);

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
    // User's current username is always "available" to them
    if (username === currentUsernameRef.current) {
      setUsernameAvailable(true);
      setCheckingUsername(false);
      return;
    }
    setCheckingUsername(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/username-available?username=${encodeURIComponent(username)}`);
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

  async function handleFollowToggle(user: SuggestedUser) {
    if (followingIds.has(user.id)) return; // in-flight
    if (followedIds.has(user.id)) return; // already followed

    setFollowingIds((prev) => new Set(prev).add(user.id));
    try {
      await fetch(`/api/follow/${user.username}`, { method: "POST" });
      setFollowedIds((prev) => new Set(prev).add(user.id));
    } catch {
      // non-fatal, user can follow later
    } finally {
      setFollowingIds((prev) => {
        const next = new Set(prev);
        next.delete(user.id);
        return next;
      });
    }
  }

  async function saveProfile(): Promise<boolean> {
    setSaving(true);
    setError("");

    try {
      // 1. Set username if changed from the pre-filled value
      if (username.trim() && username.trim() !== currentUsernameRef.current) {
        const usernameRes = await fetch("/api/me/username", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: username.trim() }),
        });
        if (!usernameRes.ok) {
          const data = await usernameRes.json();
          setError(data.errors?.username?.[0] ?? data.error ?? "Could not set username");
          setSaving(false);
          return false;
        }
      }

      // 2. Upload avatar if newly selected (data URIs start with "data:", existing URLs don't)
      if (avatarDataUri && avatarDataUri.startsWith("data:")) {
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
          settings: { onboarded: true, guidelines_accepted: true },
        }),
      });

      if (!profileRes.ok) {
        const data = await profileRes.json();
        setError(data.error ?? "Could not save profile");
        setSaving(false);
        return false;
      }

      setSaving(false);
      return true;
    } catch {
      setError("Network error — please try again");
      setSaving(false);
      return false;
    }
  }

  async function handleFinishAndProceed() {
    const saved = await saveProfile();
    if (saved) {
      setStep(TOTAL_STEPS - 1); // go to "What's next?" step
    }
  }

  function handleSkip() {
    fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: { onboarded: true } }),
    }).then(() => setStep(TOTAL_STEPS - 1)).catch(() => setStep(TOTAL_STEPS - 1));
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
      <div className={`w-full ${step === 4 ? "max-w-4xl" : "max-w-md"}`} style={{ transition: "max-width 0.3s ease" }}>
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
            {step === 1 && "Set your avatar and pronouns"}
            {step === 2 && "Tell people about yourself"}
            {step === 3 && "Pick your vibe"}
            {step === 4 && "Our community standards"}
            {step === 5 && "Find some writers to follow"}
            {step === 6 && "You're all set!"}
          </p>
        </div>

        {step < TOTAL_STEPS - 1 && <StepDots current={step} total={TOTAL_STEPS - 1} />}

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
                  Avatar
                </label>
                <div className="flex flex-col items-center gap-3">
                  <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                    <AvatarWithFrame url={avatarDataUri} name={displayName || username || "?"} size={96} />
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
                    {uploading ? "Processing..." : avatarDataUri ? "Change avatar" : "Choose avatar"}
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

          {/* Step 5: Community Guidelines Book */}
          {step === 4 && (
            <div className="flex flex-col gap-3">
              <GuidelinesBook onAgree={nextStep} />
            </div>
          )}

          {/* Step 6: Discover writers */}
          {step === 5 && (
            <div className="flex flex-col gap-3">
              {loadingSuggested ? (
                <div className="flex items-center justify-center py-8">
                  <p className="text-sm" style={{ color: "var(--muted)" }}>Finding writers…</p>
                </div>
              ) : suggestedUsers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
                  <p className="text-sm" style={{ color: "var(--muted)" }}>
                    No writers to suggest yet — you can discover people from the Explore page.
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    Follow writers to see their entries in your feed. You can always find more on Explore.
                  </p>
                  <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
                    {suggestedUsers.map((u) => {
                      const followed = followedIds.has(u.id);
                      const inFlight = followingIds.has(u.id);
                      return (
                        <div
                          key={u.id}
                          className="flex items-center gap-3 rounded-xl border p-3"
                          style={{ borderColor: "var(--border)", background: "var(--background)" }}
                        >
                          {u.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={u.avatar_url}
                              alt={u.display_name ?? u.username}
                              width={40}
                              height={40}
                              className="rounded-full object-cover flex-shrink-0"
                              style={{ width: 40, height: 40 }}
                            />
                          ) : (
                            <div
                              className="rounded-full flex items-center justify-center font-semibold flex-shrink-0 select-none"
                              style={{
                                width: 40, height: 40,
                                background: "var(--accent-light)", color: "var(--accent)",
                                fontSize: 14,
                              }}
                              aria-hidden="true"
                            >
                              {(u.display_name ?? u.username ?? "?")[0].toUpperCase()}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {u.display_name ?? u.username}
                            </p>
                            {u.bio && (
                              <p className="text-xs truncate" style={{ color: "var(--muted)" }}>
                                {u.bio}
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleFollowToggle(u)}
                            disabled={followed || inFlight}
                            className="flex-shrink-0 rounded-full px-3 py-1 text-xs font-medium border transition-all disabled:opacity-60"
                            style={
                              followed
                                ? { borderColor: "var(--border)", color: "var(--muted)", background: "var(--background)" }
                                : { borderColor: "var(--accent)", color: "var(--accent)", background: "transparent" }
                            }
                          >
                            {inFlight ? "…" : followed ? "Requested" : "Follow"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 7: What's next? */}
          {step === 6 && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-center" style={{ color: "var(--muted)" }}>
                Your profile is ready. What would you like to do first?
              </p>
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => router.push("/explore")}
                  className="flex items-center gap-4 rounded-xl border p-4 text-left transition-all hover:border-[var(--accent)]"
                  style={{ borderColor: "var(--border)", background: "var(--background)" }}
                >
                  <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8"/>
                      <path d="M21 21l-4.35-4.35"/>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">Explore the community</p>
                    <p className="text-xs" style={{ color: "var(--muted)" }}>
                      Read what others are writing and discover new voices
                    </p>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--muted)", flexShrink: 0 }}>
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </button>

                <button
                  type="button"
                  onClick={() => router.push("/editor")}
                  className="flex items-center gap-4 rounded-xl border p-4 text-left transition-all hover:border-[var(--accent)]"
                  style={{ borderColor: "var(--border)", background: "var(--background)" }}
                >
                  <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 3a2.85 2.85 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">Write your first entry</p>
                    <p className="text-xs" style={{ color: "var(--muted)" }}>
                      Open the editor and start journaling right away
                    </p>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--muted)", flexShrink: 0 }}>
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </button>

                <button
                  type="button"
                  onClick={() => router.push(`/${username || "feed"}`)}
                  className="flex items-center gap-4 rounded-xl border p-4 text-left transition-all hover:border-[var(--accent)]"
                  style={{ borderColor: "var(--border)", background: "var(--background)" }}
                >
                  <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                      <circle cx="12" cy="7" r="4"/>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">View your profile</p>
                    <p className="text-xs" style={{ color: "var(--muted)" }}>
                      See how your page looks and customize it further
                    </p>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--muted)", flexShrink: 0 }}>
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </button>
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm mt-4" style={{ color: "var(--danger)" }}>{error}</p>
          )}

          {/* Navigation — hidden on guidelines step (step 4) and "What's next?" step (step 6) */}
          {step !== 4 && step !== 6 && (
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
                {step < TOTAL_STEPS - 2 && step > 0 && (
                  <button type="button" onClick={handleSkip}
                    className="text-xs transition-colors hover:underline"
                    style={{ color: "var(--muted)" }}>
                    Skip all
                  </button>
                )}
                {step === TOTAL_STEPS - 2 ? (
                  <button
                    type="button"
                    onClick={handleFinishAndProceed}
                    disabled={saving}
                    className="rounded-full px-6 py-2.5 text-sm font-medium transition-opacity disabled:opacity-40"
                    style={{ background: "var(--accent)", color: "#fff" }}>
                    {saving ? "Saving..." : "Finish setup"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={nextStep}
                    disabled={!canProceedStep0 && step === 0}
                    className="rounded-full px-6 py-2.5 text-sm font-medium transition-opacity disabled:opacity-40"
                    style={{ background: "var(--accent)", color: "#fff" }}>
                    Next
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
