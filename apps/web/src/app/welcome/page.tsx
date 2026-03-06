"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { resizeImage } from "@/lib/image-utils";
import { PROFILE_THEMES } from "@/lib/profile-themes";
import { AvatarWithFrame } from "@/components/avatar-with-frame";
import { GuidelinesBook } from "@/components/guidelines-book";
import { BioEditor } from "@/components/bio-editor";
import dynamic from "next/dynamic";
import type { AvatarConfig } from "@/lib/avatar-builder-config";

const AvatarBuilder = dynamic(
  () => import("@/components/avatar-builder").then((m) => m.AvatarBuilder),
  { ssr: false, loading: () => <div style={{ padding: "1rem", color: "var(--muted)", textAlign: "center" }}>Loading builder...</div> }
);
const TOTAL_STEPS = 9;

type SuggestedUser = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  avatar_frame: string | null;
  subscription_tier: string;
  entry_count: number;
  ink_count: number;
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
  const [avatarMode, setAvatarMode] = useState<"upload" | "build">("upload");
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfig | null>(null);

  // Step 3: Bio & Status
  const [bioHtml, setBioHtml] = useState("");
  const [status, setStatus] = useState("");

  // Step 4: Theme
  const [theme, setTheme] = useState("default");

  // Step 5: Discover writers
  const [suggestedUsers, setSuggestedUsers] = useState<SuggestedUser[]>([]);
  const [loadingSuggested, setLoadingSuggested] = useState(false);
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());

  // Step 6: Invite friends
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteEmails, setInviteEmails] = useState([""]);
  const [inviteMessage, setInviteMessage] = useState("");
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);

  // Step 5: Choose your path (tier selection)
  const [selectedTier, setSelectedTier] = useState<"free" | "plus">("free");
  const [selectedDonorAmount, setSelectedDonorAmount] = useState<number | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutReturned, setCheckoutReturned] = useState<"success" | "canceled" | null>(null);
  const [checkoutType, setCheckoutType] = useState<string | null>(null);
  const [activatingSubscription, setActivatingSubscription] = useState(false);
  const [currentTier, setCurrentTier] = useState<string>("free");
  const [currentDonorStatus, setCurrentDonorStatus] = useState<string | null>(null);

  // General
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  // Pre-fill fields from existing user data (e.g. fediverse-derived username)
  useEffect(() => {
    // Read plan cookie (set by get-started page)
    try {
      const planCookie = document.cookie.split("; ").find((c) => c.startsWith("inkwell_plan="));
      if (planCookie) {
        const plan = planCookie.split("=")[1];
        if (plan === "plus") setSelectedTier("plus");
        // Clear cookie after reading
        document.cookie = "inkwell_plan=; path=/; max-age=0";
      }
    } catch { /* ignore */ }

    // Handle Stripe checkout return
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    const type = params.get("type");
    const returnStep = params.get("step");

    if (checkout && returnStep) {
      setStep(parseInt(returnStep, 10));
      setCheckoutReturned(checkout as "success" | "canceled");
      setCheckoutType(type);
      // Clean URL params
      window.history.replaceState({}, "", "/welcome");
    }

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
        if (user.bio_html) setBioHtml(user.bio_html);
        else if (user.bio) setBioHtml(user.bio);
        // Track current subscription state
        if (user.subscription_tier) setCurrentTier(user.subscription_tier);
        if (user.ink_donor_status) setCurrentDonorStatus(user.ink_donor_status);
        if (user.subscription_tier === "plus") setSelectedTier("plus");
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // Poll for subscription activation after Stripe checkout return
  useEffect(() => {
    if (checkoutReturned !== "success" || !checkoutType) return;

    setActivatingSubscription(true);
    let attempts = 0;

    const poll = async () => {
      attempts++;
      try {
        const res = await fetch("/api/session");
        if (res.ok) {
          const data = await res.json();
          const user = data?.data;
          if (checkoutType === "plus" && user?.subscription_tier === "plus") {
            setCurrentTier("plus");
            setSelectedTier("plus");
            setActivatingSubscription(false);
            setCheckoutReturned(null);
            return;
          }
          if (checkoutType === "donor" && user?.ink_donor_status === "active") {
            setCurrentDonorStatus("active");
            setActivatingSubscription(false);
            setCheckoutReturned(null);
            return;
          }
        }
      } catch { /* ignore */ }

      if (attempts < 3) {
        setTimeout(poll, 2000);
      } else {
        // Give up polling but show success anyway — webhook will catch up
        if (checkoutType === "plus") setCurrentTier("plus");
        if (checkoutType === "donor") setCurrentDonorStatus("active");
        setActivatingSubscription(false);
        setCheckoutReturned(null);
      }
    };

    // Start polling after a brief delay
    setTimeout(poll, 1500);
  }, [checkoutReturned, checkoutType]);

  // Fetch suggested writers when entering step 6 (was step 5)
  useEffect(() => {
    if (step !== 6) return;
    setLoadingSuggested(true);
    fetch("/api/discover/writers")
      .then((r) => r.json())
      .then((data) => setSuggestedUsers(data.data ?? []))
      .catch(() => setSuggestedUsers([]))
      .finally(() => setLoadingSuggested(false));
  }, [step]);

  // Fetch invite code when entering step 7 (was step 6)
  useEffect(() => {
    if (step !== 7) return;
    fetch("/api/invite-code")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.url) setInviteUrl(data.url); })
      .catch(() => {});
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

  async function handleInviteCopy() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    } catch {
      // Fallback: select the input
    }
  }

  function handleInviteShareX() {
    if (!inviteUrl) return;
    const text = encodeURIComponent(`I've been writing on @inkwellsocial -- a social journal with no algorithms and no ads. Join me: ${inviteUrl}`);
    window.open(`https://x.com/intent/tweet?text=${text}`, "_blank");
  }
  function handleInviteShareBluesky() {
    if (!inviteUrl) return;
    const text = encodeURIComponent(`I've been writing on Inkwell — a social journal with no algorithms and no ads. Join me: ${inviteUrl}`);
    window.open(`https://bsky.app/intent/compose?text=${text}`, "_blank");
  }
  function handleInviteShareMastodon() {
    if (!inviteUrl) return;
    const text = encodeURIComponent(`I've been writing on #Inkwell — a social journal on the open web, no algorithms and no ads. Join me: ${inviteUrl}`);
    window.open(`https://mastodonshare.com/?text=${text}`, "_blank");
  }
  function handleInviteShareFacebook() {
    if (!inviteUrl) return;
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(inviteUrl)}`, "_blank");
  }

  async function handleSendInvites() {
    const validEmails = inviteEmails.filter((em) => em.trim() && em.includes("@"));
    if (validEmails.length === 0) return;
    setInviteSending(true);
    try {
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emails: validEmails,
          message: inviteMessage.trim() || undefined,
        }),
      });
      if (res.ok) {
        setInviteSent(true);
        setInviteEmails([""]);
        setInviteMessage("");
        setTimeout(() => setInviteSent(false), 3000);
      }
    } catch {
      // Non-fatal
    } finally {
      setInviteSending(false);
    }
  }

  async function handleTierCheckout() {
    setCheckoutLoading(true);
    setError("");

    try {
      // Determine what to checkout for
      // If Plus is selected and not already Plus, checkout Plus first
      if (selectedTier === "plus" && currentTier !== "plus") {
        const res = await fetch("/api/billing/onboarding-checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "plus" }),
        });
        const data = await res.json();
        if (data.url) {
          // Save donor selection in sessionStorage so we can offer it after Plus return
          if (selectedDonorAmount) {
            sessionStorage.setItem("inkwell_donor_amount", String(selectedDonorAmount));
          }
          window.location.href = data.url;
          return;
        }
        setError(data.error || "Unable to start checkout. Please try again.");
        setCheckoutLoading(false);
        return;
      }

      // If donor is selected and not already a donor, checkout donor
      if (selectedDonorAmount && currentDonorStatus !== "active") {
        const res = await fetch("/api/billing/onboarding-checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "donor", amount_cents: selectedDonorAmount }),
        });
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
          return;
        }
        setError(data.error || "Unable to start checkout. Please try again.");
        setCheckoutLoading(false);
        return;
      }

      // Nothing to checkout — proceed to next step
      nextStep();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setCheckoutLoading(false);
    }
  }

  // After returning from Plus checkout, check if donor was also selected
  useEffect(() => {
    if (currentTier === "plus" && !activatingSubscription && step === 5) {
      const savedDonor = sessionStorage.getItem("inkwell_donor_amount");
      if (savedDonor) {
        sessionStorage.removeItem("inkwell_donor_amount");
        const amount = parseInt(savedDonor, 10);
        if ([100, 200, 300].includes(amount) && currentDonorStatus !== "active") {
          setSelectedDonorAmount(amount);
        }
      }
    }
  }, [currentTier, activatingSubscription, step, currentDonorStatus]);

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
          ...(bioHtml.trim() ? { bio_html: bioHtml.trim() } : {}),
          ...(pronouns.trim() ? { pronouns: pronouns.trim() } : {}),
          ...(status.trim() ? { profile_status: status.trim() } : {}),
          ...(theme !== "default" ? { profile_theme: theme } : {}),
          ...(avatarConfig ? { avatar_config: avatarConfig } : {}),
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
      <div className={`w-full ${step === 4 ? "max-w-4xl" : step === 5 ? "max-w-2xl" : "max-w-md"}`} style={{ transition: "max-width 0.3s ease" }}>
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
            {step === 5 && "Every writer\u2019s journey is different"}
            {step === 6 && "Find some writers to follow"}
            {step === 7 && "Bring your friends along"}
            {step === 8 && "You\u2019re all set!"}
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

                {/* Upload / Build toggle */}
                <div className="flex justify-center gap-1 mb-4 p-0.5 rounded-lg" style={{ background: "var(--border)" }}>
                  <button
                    type="button"
                    onClick={() => setAvatarMode("upload")}
                    className="flex-1 text-sm font-medium py-1.5 px-3 rounded-md transition-all"
                    style={{
                      background: avatarMode === "upload" ? "var(--surface)" : "transparent",
                      color: avatarMode === "upload" ? "var(--foreground)" : "var(--muted)",
                      boxShadow: avatarMode === "upload" ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
                    }}
                  >
                    Upload photo
                  </button>
                  <button
                    type="button"
                    onClick={() => setAvatarMode("build")}
                    className="flex-1 text-sm font-medium py-1.5 px-3 rounded-md transition-all"
                    style={{
                      background: avatarMode === "build" ? "var(--surface)" : "transparent",
                      color: avatarMode === "build" ? "var(--foreground)" : "var(--muted)",
                      boxShadow: avatarMode === "build" ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
                    }}
                  >
                    Build avatar
                  </button>
                </div>

                {avatarMode === "upload" && (
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
                )}

                {avatarMode === "build" && (
                  <>
                    <AvatarBuilder
                      compact
                      initialConfig={avatarConfig}
                      photoUrl={null}
                      displayName={displayName || username || "?"}
                      onSave={async (config, renderedDataUri) => {
                        setAvatarConfig(config);
                        setAvatarDataUri(renderedDataUri);
                      }}
                    />
                    <p className="avatar-builder-attribution">
                      Illustrations by{" "}
                      <a href="https://www.dicebear.com/styles/croodles/" target="_blank" rel="noopener noreferrer">
                        Croodles
                      </a>
                      {" "}via{" "}
                      <a href="https://www.dicebear.com" target="_blank" rel="noopener noreferrer">
                        DiceBear
                      </a>
                      {" "}&mdash; custom Inkwell avatars coming soon.
                    </p>
                  </>
                )}
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
                <BioEditor
                  content={bioHtml}
                  onChange={setBioHtml}
                  placeholder="Tell people about yourself..."
                  compact
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

          {/* Step 5: Choose Your Path — tier selection */}
          {step === 5 && (
            <div className="flex flex-col gap-5">
              <h2 className="text-lg font-semibold text-center" style={{ fontFamily: "var(--font-lora, Georgia, serif)", fontStyle: "italic" }}>
                Choose your path
              </h2>

              {activatingSubscription && (
                <div className="flex items-center justify-center gap-2 py-6">
                  <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" stroke="var(--border)" strokeWidth="3" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  <p className="text-sm" style={{ color: "var(--muted)" }}>
                    {checkoutType === "plus" ? "Activating your Plus subscription..." : "Activating your Ink Donor badge..."}
                  </p>
                </div>
              )}

              {checkoutReturned === "canceled" && !activatingSubscription && (
                <p className="text-sm text-center rounded-lg px-3 py-2" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                  No worries — you can always upgrade later from Settings.
                </p>
              )}

              {!activatingSubscription && (
                <>
                  {/* Tier cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Free tier */}
                    <button
                      type="button"
                      onClick={() => { if (currentTier !== "plus") setSelectedTier("free"); }}
                      className="onboarding-tier-card rounded-xl border-2 p-4 text-left transition-all"
                      style={{
                        borderColor: selectedTier === "free" ? "var(--accent)" : "var(--border)",
                        background: "var(--background)",
                        opacity: currentTier === "plus" ? 0.5 : 1,
                        cursor: currentTier === "plus" ? "default" : "pointer",
                      }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-semibold">Free</p>
                        {selectedTier === "free" && (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <circle cx="12" cy="12" r="10" fill="var(--accent)" />
                            <path d="M8 12l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <p className="text-2xl font-bold mb-3">$0<span className="text-xs font-normal" style={{ color: "var(--muted)" }}> /month</span></p>
                      <ul className="space-y-1.5 text-xs" style={{ color: "var(--muted)" }}>
                        {["Unlimited entries", "8 profile themes", "Newsletter (500 subs)", "RSS feed", "Per-entry privacy", "100 MB images"].map((item) => (
                          <li key={item} className="flex gap-1.5 items-start">
                            <span style={{ color: "var(--success)" }}>&#10003;</span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </button>

                    {/* Plus tier */}
                    <button
                      type="button"
                      onClick={() => setSelectedTier("plus")}
                      className="onboarding-tier-card rounded-xl border-2 p-4 text-left transition-all relative"
                      style={{
                        borderColor: selectedTier === "plus" ? "var(--accent)" : "var(--border)",
                        background: "var(--background)",
                      }}
                    >
                      <div className="absolute top-2 right-2 rounded-full px-2 py-0.5 text-[10px] font-medium"
                        style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                        Best value
                      </div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-semibold" style={{ color: "var(--accent)" }}>Inkwell Plus</p>
                        {(selectedTier === "plus" || currentTier === "plus") && (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <circle cx="12" cy="12" r="10" fill="var(--accent)" />
                            <path d="M8 12l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <p className="text-2xl font-bold mb-3">$5<span className="text-xs font-normal" style={{ color: "var(--muted)" }}> /month</span></p>
                      {currentTier === "plus" && (
                        <p className="text-xs font-medium mb-2" style={{ color: "var(--accent)" }}>Active</p>
                      )}
                      <ul className="space-y-1.5 text-xs" style={{ color: "var(--muted)" }}>
                        {["Everything in Free", "Custom colors & fonts", "Unlimited newsletter", "Postage (reader support)", "Custom HTML & CSS", "Plus badge"].map((item) => (
                          <li key={item} className="flex gap-1.5 items-start">
                            <span style={{ color: "var(--accent)" }}>&#10003;</span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </button>
                  </div>

                  {/* Ink Donor section */}
                  <div className="flex items-center gap-3 mt-1">
                    <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
                    <span className="text-[10px] uppercase tracking-widest" style={{ color: "var(--muted)" }}>Optional</span>
                    <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
                  </div>

                  <div className="text-center">
                    <div className="flex items-center justify-center gap-2 mb-1.5">
                      <svg width="14" height="17" viewBox="0 0 10 12" fill="var(--ink-deep, #2d4a8a)" aria-hidden="true">
                        <path d="M5 0C5 0 0 5.5 0 8a5 5 0 0 0 10 0C10 5.5 5 0 5 0Z" />
                      </svg>
                      <p className="text-sm font-semibold" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
                        Become an Ink Donor
                      </p>
                    </div>
                    <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>
                      Help keep Inkwell ad-free. No features unlocked — just an ink-blue badge and our gratitude.
                    </p>

                    {currentDonorStatus === "active" ? (
                      <p className="text-xs font-medium" style={{ color: "var(--ink-deep, #2d4a8a)" }}>
                        You&apos;re already an Ink Donor — thank you!
                      </p>
                    ) : (
                      <div className="flex items-center justify-center gap-3">
                        {[
                          { cents: 100, label: "$1" },
                          { cents: 200, label: "$2" },
                          { cents: 300, label: "$3" },
                        ].map(({ cents, label }) => (
                          <button
                            key={cents}
                            type="button"
                            onClick={() => setSelectedDonorAmount(selectedDonorAmount === cents ? null : cents)}
                            className="onboarding-donor-pill flex flex-col items-center justify-center rounded-full transition-all"
                            style={{
                              width: 56,
                              height: 56,
                              border: selectedDonorAmount === cents ? "2px solid var(--ink-deep, #2d4a8a)" : "2px solid var(--border)",
                              background: selectedDonorAmount === cents ? "rgba(45, 74, 138, 0.08)" : "var(--background)",
                            }}
                          >
                            <span className="text-sm font-bold" style={{ color: selectedDonorAmount === cents ? "var(--ink-deep, #2d4a8a)" : "var(--foreground)" }}>{label}</span>
                            <span className="text-[9px]" style={{ color: "var(--muted)" }}>/mo</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center justify-between gap-4 pt-4 mt-1 border-t" style={{ borderColor: "var(--border)" }}>
                    <button type="button" onClick={prevStep}
                      className="text-sm transition-colors hover:underline"
                      style={{ color: "var(--muted)" }}>
                      Back
                    </button>

                    <div className="flex items-center gap-3">
                      {/* Skip all */}
                      <button type="button" onClick={handleSkip}
                        className="text-xs transition-colors hover:underline"
                        style={{ color: "var(--muted)" }}>
                        Skip all
                      </button>

                      {/* If nothing to checkout, just continue */}
                      {((selectedTier === "free" || currentTier === "plus") && (!selectedDonorAmount || currentDonorStatus === "active")) ? (
                        <button
                          type="button"
                          onClick={nextStep}
                          className="rounded-full px-6 py-2.5 text-sm font-medium transition-opacity"
                          style={{ background: "var(--accent)", color: "#fff" }}>
                          Continue
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleTierCheckout}
                          disabled={checkoutLoading}
                          className="rounded-full px-6 py-2.5 text-sm font-medium transition-opacity disabled:opacity-40"
                          style={{ background: "var(--accent)", color: "#fff" }}>
                          {checkoutLoading ? "Loading..." : "Continue to checkout"}
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 6: Discover writers (was step 5) */}
          {step === 6 && (
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1">
                    {suggestedUsers.map((u) => {
                      const followed = followedIds.has(u.id);
                      const inFlight = followingIds.has(u.id);
                      return (
                        <div
                          key={u.id}
                          className="flex flex-col items-center gap-2 rounded-xl border p-4 text-center"
                          style={{ borderColor: "var(--border)", background: "var(--background)" }}
                        >
                          <AvatarWithFrame
                            url={u.avatar_url}
                            name={u.display_name ?? u.username}
                            size={56}
                            frame={u.avatar_frame}
                            subscriptionTier={u.subscription_tier}
                          />
                          <div className="min-w-0 w-full">
                            <p className="text-sm font-medium truncate">
                              {u.display_name ?? u.username}
                            </p>
                            <p className="text-xs truncate" style={{ color: "var(--muted)" }}>
                              @{u.username}
                            </p>
                            {u.bio && (
                              <p className="text-xs mt-1" style={{ color: "var(--muted)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                                {u.bio}
                              </p>
                            )}
                            {u.entry_count > 0 && (
                              <p className="text-xs mt-1.5" style={{ color: "var(--accent)" }}>
                                {u.entry_count} {u.entry_count === 1 ? "entry" : "entries"}
                                {u.ink_count > 0 && <> · {u.ink_count} {u.ink_count === 1 ? "ink" : "inks"}</>}
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleFollowToggle(u)}
                            disabled={followed || inFlight}
                            className="rounded-full px-4 py-1.5 text-xs font-medium border transition-all disabled:opacity-60 w-full"
                            style={
                              followed
                                ? { borderColor: "var(--border)", color: "var(--muted)", background: "var(--background)" }
                                : { borderColor: "var(--accent)", color: "#fff", background: "var(--accent)" }
                            }
                          >
                            {inFlight ? "…" : followed ? "Following" : "Follow"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 7: Invite friends (was step 6) */}
          {step === 7 && (
            <div className="flex flex-col gap-5">
              {/* Share invite link */}
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide mb-2" style={{ color: "var(--muted)" }}>
                  Share your invite link
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={inviteUrl}
                    className={`flex-1 ${inputClass}`}
                    style={inputStyle}
                    onFocus={(e) => e.target.select()}
                  />
                  <button
                    type="button"
                    onClick={handleInviteCopy}
                    className="rounded-lg border px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap"
                    style={{ borderColor: "var(--border)", background: inviteCopied ? "var(--accent)" : "var(--surface)", color: inviteCopied ? "#fff" : "var(--foreground)" }}
                  >
                    {inviteCopied ? "Copied!" : "Copy"}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2.5">
                  <button type="button" onClick={handleInviteShareBluesky}
                    className="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
                    style={{ borderColor: "var(--border)" }}>Bluesky</button>
                  <button type="button" onClick={handleInviteShareMastodon}
                    className="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
                    style={{ borderColor: "var(--border)" }}>Mastodon</button>
                  <button type="button" onClick={handleInviteShareX}
                    className="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
                    style={{ borderColor: "var(--border)" }}>X</button>
                  <button type="button" onClick={handleInviteShareFacebook}
                    className="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
                    style={{ borderColor: "var(--border)" }}>Facebook</button>
                </div>
                <p className="text-xs mt-1.5" style={{ color: "var(--muted)" }}>
                  Anyone who signs up through this link is connected to you.
                </p>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
                <span className="text-xs" style={{ color: "var(--muted)" }}>or send a sealed letter</span>
                <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
              </div>

              {/* Email invites */}
              <div>
                {inviteEmails.map((em, i) => (
                  <div key={i} className="flex items-center gap-2 mb-2">
                    <input
                      type="email"
                      value={em}
                      onChange={(e) => {
                        const updated = [...inviteEmails];
                        updated[i] = e.target.value;
                        setInviteEmails(updated);
                      }}
                      placeholder="friend@example.com"
                      className={inputClass}
                      style={inputStyle}
                    />
                    {inviteEmails.length > 1 && (
                      <button type="button" onClick={() => setInviteEmails(inviteEmails.filter((_, j) => j !== i))}
                        className="text-xs" style={{ color: "var(--muted)" }}>
                        Remove
                      </button>
                    )}
                  </div>
                ))}
                {inviteEmails.length < 3 && (
                  <button type="button" onClick={() => setInviteEmails([...inviteEmails, ""])}
                    className="text-sm" style={{ color: "var(--accent)" }}>
                    + Add another
                  </button>
                )}
                <textarea
                  value={inviteMessage}
                  onChange={(e) => setInviteMessage(e.target.value.slice(0, 500))}
                  placeholder="Write something personal... (optional)"
                  rows={2}
                  maxLength={500}
                  className={`${inputClass} resize-none mt-3`}
                  style={inputStyle}
                />
                {inviteSent && (
                  <p className="text-sm font-medium mt-2" style={{ color: "var(--accent)" }}>
                    Invitations sent!
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleSendInvites}
                  disabled={inviteSending || inviteEmails.every((e) => !e.trim())}
                  className="rounded-full px-5 py-2 text-sm font-medium mt-3 transition-opacity disabled:opacity-50"
                  style={{ background: "var(--accent)", color: "#fff" }}
                >
                  {inviteSending ? "Sending..." : "Seal & send"}
                </button>
              </div>
            </div>
          )}

          {/* Step 9: What's next? (was step 7) */}
          {step === 8 && (
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
                      Browse public entries from Inkwell writers and the fediverse
                    </p>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--muted)", flexShrink: 0 }}>
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </button>

                <button
                  type="button"
                  onClick={() => router.push("/editor?prompt=welcome")}
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
                      Start with a writing prompt to break the ice
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

                <button
                  type="button"
                  onClick={() => router.push("/guide")}
                  className="flex items-center gap-4 rounded-xl border p-4 text-left transition-all hover:border-[var(--accent)]"
                  style={{ borderColor: "var(--border)", background: "var(--background)" }}
                >
                  <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">Learn how Inkwell works</p>
                    <p className="text-xs" style={{ color: "var(--muted)" }}>
                      A quick guide to feeds, pen pals, stamps, and the fediverse
                    </p>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--muted)", flexShrink: 0 }}>
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </button>
              </div>
              <p className="text-xs text-center mt-3" style={{ color: "var(--muted)" }}>
                You can always find these options in the sidebar.
              </p>
            </div>
          )}

          {error && (
            <p className="text-sm mt-4" style={{ color: "var(--danger)" }}>{error}</p>
          )}

          {/* Navigation — hidden on guidelines step (step 4) and "What's next?" step (step 8) */}
          {step !== 4 && step !== 5 && step !== 8 && (
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
