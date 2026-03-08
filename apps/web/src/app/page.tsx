import type { Metadata } from "next";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

export const metadata: Metadata = {
  title: "Inkwell — A Federated Social Journaling Platform",
  description:
    "Your journal, your pen pals, your space. Write, connect, and customize — with no algorithms, no ads, and full ownership of your words. Free forever.",
  openGraph: {
    title: "Inkwell — Your Journal, Your Pen Pals, Your Space",
    description:
      "A federated social journaling platform. The warmth of LiveJournal, the creativity of MySpace, rebuilt for the open web.",
    url: "https://inkwell.social",
    type: "website",
  },
  twitter: {
    card: "summary",
    site: "@inkwellsocial",
    title: "Inkwell — Your Journal, Your Pen Pals, Your Space",
    description:
      "A federated social journaling platform with no algorithms, no ads. Free forever.",
  },
  alternates: {
    canonical: "https://inkwell.social",
  },
};
import { HeroSection } from "@/components/landing/hero-section";
import { FeaturesSection } from "@/components/landing/features-section";
import { CommunityEntries } from "@/components/landing/community-entries";
import { FinalCta } from "@/components/landing/final-cta";

interface ExploreEntry {
  id: string;
  title: string | null;
  excerpt: string | null;
  body_html: string;
  slug: string | null;
  word_count: number;
  category: string | null;
  cover_image_id: string | null;
  published_at: string;
  source: "local" | "remote";
  author: {
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
}

async function getRecentEntries(): Promise<ExploreEntry[]> {
  try {
    const data = await apiFetch<{ data: ExploreEntry[] }>(
      "/api/explore?per_page=6"
    );
    return data.data
      .filter((e) => e.source === "local" && e.title)
      .slice(0, 6);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default async function LandingPage() {
  const recentEntries = await getRecentEntries();

  return (
    <div className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>

      {/* ── Hero — "The First Stroke" ──────────────────────────────── */}
      <HeroSection />

      {/* ── Features — "The Pages" ─────────────────────────────────── */}
      <FeaturesSection />

      {/* ── Community — "Fresh Ink" ─────────────────────────────────── */}
      <CommunityEntries entries={recentEntries} />

      {/* ── Mission — "The Manifesto" ───────────────────────────────── */}
      <section className="landing-manifesto" aria-label="Our mission">
        <div className="mx-auto max-w-3xl px-4 text-center relative">
          <p className="landing-manifesto-ornament" aria-hidden="true">&middot; &middot; &middot;</p>
          <p className="landing-manifesto-quote">
            &ldquo;We believe the internet was at its best when it felt like a
            place people genuinely lived. Long-form writing. Personal pages. The
            sense that you were getting to know someone.&rdquo;
          </p>
          <Link href="/about" className="landing-cta-secondary">
            Read our mission &rarr;
          </Link>
        </div>
      </section>

      {/* ── Pricing — "Choose Your Ink" ─────────────────────────────── */}
      <section className="landing-pricing" aria-label="Pricing">
        <div className="landing-pricing-inner">
          <p className="landing-section-eyebrow">Pricing</p>
          <h2 className="landing-section-title" style={{ marginBottom: "1rem" }}>
            Choose your ink
          </h2>
          <p className="text-base leading-relaxed mb-10 max-w-2xl mx-auto" style={{ color: "var(--muted)" }}>
            Inkwell is free to use — no trial, no expiry, no bait-and-switch. Plus ($5/mo) unlocks
            power-user features and helps sustain the platform for everyone.
          </p>

          <div className="flex flex-col sm:flex-row gap-6 justify-center items-stretch sm:items-start">
            {/* Free tier */}
            <div
              className="w-full sm:flex-1 sm:max-w-xs rounded-2xl border p-5 sm:p-6 text-left"
              style={{ borderColor: "var(--border)", background: "var(--background)" }}
            >
              <p className="text-sm font-medium mb-1" style={{ color: "var(--muted)" }}>Free</p>
              <p className="text-3xl font-bold mb-4">$0</p>
              <ul className="space-y-2 text-sm" style={{ color: "var(--muted)" }}>
                {[
                  "Unlimited public entries",
                  "8 profile themes",
                  "Per-entry privacy controls",
                  "Version history (25 per entry)",
                  "Series & collections (up to 5)",
                  "Bookmarks & reading list",
                  "Categories & cover images",
                  "Data import (WordPress, Medium, Substack & more)",
                  "Explore fediverse content from across the open web",
                  "Email newsletter (500 subscribers, 2 sends/mo)",
                  "API access (read-only, 100 req/15 min)",
                  "100 MB image storage",
                  "Up to 10 drafts",
                  "RSS feed",
                ].map((item) => (
                  <li key={item} className="flex gap-2 items-start">
                    <span style={{ color: "var(--success)" }} aria-hidden="true">&#10003;</span>
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                href="/get-started?plan=free"
                className="mt-6 block text-center rounded-full py-2 text-sm font-medium transition-opacity hover:opacity-80"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                Start for free
              </Link>
            </div>

            {/* Plus tier */}
            <div
              className="landing-plus-card w-full sm:flex-1 sm:max-w-xs rounded-2xl border-2 p-5 sm:p-6 text-left relative overflow-hidden"
              style={{ borderColor: "var(--accent)", background: "var(--background)" }}
            >
              <div className="absolute top-3 right-3 rounded-full px-2 py-0.5 text-xs font-medium z-[1]"
                style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                Best value
              </div>
              <p className="text-sm font-medium mb-1 relative z-[1]" style={{ color: "var(--accent)" }}>Inkwell Plus</p>
              <p className="text-3xl font-bold mb-4 relative z-[1]">
                $5
                <span className="text-base font-normal" style={{ color: "var(--muted)" }}>/mo</span>
              </p>
              <ul className="space-y-2 text-sm relative z-[1]" style={{ color: "var(--muted)" }}>
                {[
                  "Everything in Free",
                  "Unlimited newsletter subscribers, 8 sends/mo",
                  "Custom newsletter name & reply-to",
                  "Scheduled newsletter sends",
                  "Unlimited version history",
                  "Unlimited series & collections",
                  "1 GB image storage",
                  "Unlimited drafts",
                  "Integrated Postage (reader support payments)",
                  "Paid subscription plans (earn from your writing)",
                  "Cross-post to linked Mastodon accounts",
                  "API read + write access (300 req/15 min)",
                  "Custom colors, fonts & layouts",
                  "Background images & profile music",
                  "Custom HTML & CSS",
                  "Custom domain (your-site.com)",
                  "Plus badge on your profile",
                ].map((item) => (
                  <li key={item} className="flex gap-2 items-start">
                    <span style={{ color: "var(--accent)" }} aria-hidden="true">&#10003;</span>
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                href="/get-started?plan=plus"
                className="mt-6 block text-center rounded-full py-2 text-sm font-medium transition-opacity hover:opacity-80 relative z-[1]"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                Get started
              </Link>
              <p className="text-xs text-center mt-3 relative z-[1]" style={{ color: "var(--muted)" }}>
                Upgrade to Plus anytime from your settings
              </p>
            </div>
          </div>

        </div>
      </section>

      {/* ── Ink Donor — "Keep the Ink Flowing" ─────────────────────── */}
      <section className="landing-donor" aria-label="Ink Donor">
        <div className="landing-donor-inner">
          {/* Animated ink drop */}
          <div className="landing-donor-drop" aria-hidden="true">
            <svg width="32" height="40" viewBox="0 0 10 12" fill="currentColor">
              <path d="M5 0C5 0 0 5.5 0 8a5 5 0 0 0 10 0C10 5.5 5 0 5 0Z" />
            </svg>
          </div>

          <p className="landing-donor-eyebrow">Community sustained</p>

          <h2 className="landing-donor-title">
            Keep the ink flowing
          </h2>

          <p className="landing-donor-desc">
            Not everyone needs Plus — and that&apos;s okay. Ink Donors are the quiet patrons
            who keep Inkwell ad-free, algorithm-free, and open for everyone. No features
            unlocked. Just an ink-blue badge, and the knowledge that you helped keep the
            presses running.
          </p>

          <div className="landing-donor-amounts">
            {[
              { cents: 100, label: "$1" },
              { cents: 200, label: "$2" },
              { cents: 300, label: "$3" },
            ].map(({ cents, label }) => (
              <div key={cents} className="landing-donor-amount">
                <span className="landing-donor-amount-value">{label}</span>
                <span className="landing-donor-amount-period">/month</span>
              </div>
            ))}
          </div>

          <Link href="/settings/billing" className="landing-donor-cta">
            <svg width="14" height="17" viewBox="0 0 10 12" fill="currentColor" aria-hidden="true">
              <path d="M5 0C5 0 0 5.5 0 8a5 5 0 0 0 10 0C10 5.5 5 0 5 0Z" />
            </svg>
            Become an Ink Donor
          </Link>

          <p className="landing-donor-footnote">
            Every drop of ink helps. Cancel anytime.
          </p>
        </div>
      </section>

      {/* ── Colophon — "Built in the Open" ──────────────────────────── */}
      <section className="landing-colophon" aria-label="Built in the open">
        <div className="landing-colophon-inner">
          <p className="landing-section-eyebrow">Open by design</p>
          <h2 className="landing-section-title">Built in the open</h2>

          <div className="landing-colophon-grid">
            <div className="landing-colophon-item">
              <div className="landing-colophon-number">I</div>
              <div
                className="landing-colophon-pulse w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ background: "var(--accent-light)", color: "var(--accent)" }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                </svg>
              </div>
              <h3 className="landing-colophon-title">Federated by default</h3>
              <p className="landing-colophon-desc">
                Inkwell speaks ActivityPub. Follow writers on Mastodon, Ghost, and the open social web. Your journal isn&apos;t trapped here.
              </p>
            </div>

            <div className="landing-colophon-item">
              <div className="landing-colophon-number">II</div>
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ background: "var(--accent-light)", color: "var(--accent)" }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                </svg>
              </div>
              <h3 className="landing-colophon-title">Community roadmap</h3>
              <p className="landing-colophon-desc">
                Every feature is proposed, discussed, and prioritized by the people who use Inkwell.{" "}
                <Link href="/roadmap" className="underline underline-offset-2" style={{ color: "var(--accent)" }}>
                  See what&apos;s next
                </Link>.
              </p>
            </div>

            <div className="landing-colophon-item">
              <div className="landing-colophon-number">III</div>
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ background: "var(--accent-light)", color: "var(--accent)" }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
              <h3 className="landing-colophon-title">Your data stays yours</h3>
              <p className="landing-colophon-desc">
                No ads. No tracking. No algorithm. Sustained by our community, not by selling your attention.{" "}
                <Link href="/privacy" className="underline underline-offset-2" style={{ color: "var(--accent)" }}>
                  Privacy policy
                </Link>.
              </p>
            </div>
          </div>

          <p className="landing-colophon-techstack">
            Built with Elixir, React, and ActivityPub
          </p>
        </div>
      </section>

      {/* ── Final CTA — "Take Up the Pen" ───────────────────────────── */}
      <FinalCta />

      {/* Footer is rendered by the root layout */}
    </div>
  );
}
