"use client";

import { useEffect } from "react";
import Link from "next/link";

interface InviteInfo {
  username: string;
  display_name: string;
  avatar_url: string | null;
  avatar_frame: string | null;
  subscription_tier: string;
  bio: string | null;
  message: string | null;
}

const VALUE_PROPS = [
  "No algorithms, no ads -- ever",
  "Customize your page like it's 2004",
  "Your data is always yours",
  "Connected to Mastodon and the fediverse",
];

export function EmailInviteLandingContent({ inviteInfo, token }: { inviteInfo: InviteInfo; token: string }) {
  useEffect(() => {
    const value = JSON.stringify({ type: "token", value: token });
    document.cookie = `inkwell_invite=${encodeURIComponent(value)}; path=/; max-age=${30 * 86400}; SameSite=Lax`;
  }, [token]);

  const avatarUrl = inviteInfo.avatar_url || undefined;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16"
      style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
              style={{ color: "var(--accent)" }} aria-hidden="true">
              <path d="M17.5 2.5L21.5 6.5L10 18H6V14L17.5 2.5Z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M14 6L18 10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
              <path d="M6 18L2.5 21.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeOpacity="0.5"/>
            </svg>
            <span className="text-xl font-semibold tracking-tight"
              style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
              inkwell
            </span>
          </Link>
        </div>

        {/* Main card with paper texture */}
        <div className="rounded-2xl border p-8 relative overflow-hidden"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <svg className="absolute inset-0 w-full h-full opacity-[0.03] pointer-events-none" aria-hidden="true">
            <filter id="invite-email-texture">
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" stitchTiles="stitch" />
            </filter>
            <rect width="100%" height="100%" filter="url(#invite-email-texture)" />
          </svg>

          <div className="relative">
            <h1 className="text-2xl text-center mb-2 font-normal"
              style={{ fontFamily: "var(--font-lora, Georgia, serif)", color: "var(--accent)" }}>
              You&rsquo;ve received a sealed letter
            </h1>

            {/* Decorative divider */}
            <div className="flex items-center justify-center mb-6">
              <div className="w-24 h-px" style={{ background: "var(--border)" }} />
              <div className="w-3 h-3 rounded-full mx-3" style={{ background: "var(--accent)" }} />
              <div className="w-24 h-px" style={{ background: "var(--border)" }} />
            </div>

            {/* Inviter info */}
            <div className="flex flex-col items-center gap-3 mb-6">
              <div className="w-16 h-16 rounded-full overflow-hidden border-2"
                style={{ borderColor: "var(--accent)" }}>
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xl font-semibold"
                    style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                    {(inviteInfo.display_name || inviteInfo.username).charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <p className="text-center">
                <strong>@{inviteInfo.username}</strong> invites you to join Inkwell
              </p>
            </div>

            {/* Personal message */}
            {inviteInfo.message && (
              <div className="rounded-lg p-4 mb-6"
                style={{
                  background: "var(--background)",
                  borderLeft: "3px solid var(--accent)",
                }}>
                <p className="text-sm leading-relaxed"
                  style={{ fontFamily: "var(--font-lora, Georgia, serif)", fontStyle: "italic", color: "var(--muted)" }}>
                  &ldquo;{inviteInfo.message}&rdquo;
                </p>
              </div>
            )}

            {/* Description */}
            <p className="text-sm text-center mb-6 leading-relaxed" style={{ color: "var(--muted)" }}>
              Inkwell is a social journal — a place to write, share, and connect on the open social web. No algorithms, no ads, your space.
            </p>

            {/* Value props */}
            <div className="flex flex-col gap-2 mb-8 rounded-xl p-4"
              style={{ background: "var(--background)" }}>
              {VALUE_PROPS.map((prop) => (
                <div key={prop} className="flex items-center gap-2.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    style={{ color: "var(--accent)", flexShrink: 0 }} aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span className="text-sm" style={{ color: "var(--muted)" }}>{prop}</span>
                </div>
              ))}
            </div>

            {/* CTA */}
            <Link href="/get-started"
              className="block w-full text-center rounded-full py-3 text-base font-medium transition-opacity"
              style={{ background: "var(--accent)", color: "#fff" }}>
              Accept the invitation
            </Link>
          </div>
        </div>

        <p className="text-center mt-6 text-sm" style={{ color: "var(--muted)" }}>
          Already have an account?{" "}
          <Link href="/login" className="font-medium underline underline-offset-2" style={{ color: "var(--accent)" }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
