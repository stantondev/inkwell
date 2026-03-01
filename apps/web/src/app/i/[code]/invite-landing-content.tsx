"use client";

import { useEffect } from "react";
import Link from "next/link";

interface InviterInfo {
  username: string;
  display_name: string;
  avatar_url: string | null;
  avatar_frame: string | null;
  subscription_tier: string;
  bio: string | null;
}

const VALUE_PROPS = [
  "No algorithms, no ads -- ever",
  "Customize your page like it's 2004",
  "Your data is always yours",
  "Connected to Mastodon and the fediverse",
];

export function InviteLandingContent({ inviter, code }: { inviter: InviterInfo; code: string }) {
  useEffect(() => {
    // Set invite cookie (30-day expiry)
    const value = JSON.stringify({ type: "code", value: code });
    document.cookie = `inkwell_invite=${encodeURIComponent(value)}; path=/; max-age=${30 * 86400}; SameSite=Lax`;
  }, [code]);

  const avatarUrl = inviter.avatar_url || undefined;

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
          {/* Paper texture overlay */}
          <svg className="absolute inset-0 w-full h-full opacity-[0.03] pointer-events-none" aria-hidden="true">
            <filter id="invite-paper-texture">
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" stitchTiles="stitch" />
            </filter>
            <rect width="100%" height="100%" filter="url(#invite-paper-texture)" />
          </svg>

          <div className="relative">
            <h1 className="text-2xl text-center mb-6 font-normal"
              style={{ fontFamily: "var(--font-lora, Georgia, serif)", color: "var(--accent)" }}>
              You&rsquo;ve been invited
            </h1>

            {/* Inviter info */}
            <div className="flex flex-col items-center gap-3 mb-6">
              <div className="w-16 h-16 rounded-full overflow-hidden border-2"
                style={{ borderColor: "var(--accent)" }}>
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xl font-semibold"
                    style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                    {(inviter.display_name || inviter.username).charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="text-center">
                <p className="font-medium">{inviter.display_name}</p>
                <p className="text-sm" style={{ color: "var(--muted)" }}>@{inviter.username}</p>
              </div>
            </div>

            <p className="text-center mb-6" style={{ color: "var(--muted)", fontFamily: "var(--font-lora, Georgia, serif)", fontStyle: "italic" }}>
              &ldquo;{inviter.display_name} has invited you to join Inkwell&rdquo;
            </p>

            {/* Divider */}
            <div className="flex items-center gap-3 mb-6">
              <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
              <span className="text-xs tracking-widest" style={{ color: "var(--muted)" }}>&middot; &middot; &middot;</span>
              <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
            </div>

            {/* Description */}
            <p className="text-sm text-center mb-6 leading-relaxed" style={{ color: "var(--muted)" }}>
              A social journal where you own your space. Write, share, and connect on the open social web.
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
              Join Inkwell
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
