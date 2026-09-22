import type { Metadata } from "next";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

export const metadata: Metadata = {
  title: "Inkwell — Your Journal, Your Pen Pals, Your Space",
  description:
    "A social journaling platform. Write, connect, and customize with no algorithms, no ads, and full ownership of your words. Connected to Mastodon and the open social web. Free forever.",
  openGraph: {
    title: "Inkwell — Your Journal, Your Pen Pals, Your Space",
    description:
      "A social journaling platform. The warmth of LiveJournal, the creativity of MySpace, rebuilt for the open web.",
    url: "https://inkwell.social",
    type: "website",
    images: [{ url: "/api/og", width: 1200, height: 630, alt: "Inkwell — Social Journaling" }],
  },
  twitter: {
    card: "summary_large_image",
    site: "@inkwellsocial",
    title: "Inkwell — Your Journal, Your Pen Pals, Your Space",
    description:
      "A social journaling platform with no algorithms, no ads. Free forever.",
    images: ["/api/og"],
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
    // showcase=1: only writers someone else on Inkwell has inked, stamped or
    // commented on — keeps brand-new SEO spam accounts off the homepage.
    const data = await apiFetch<{ data: ExploreEntry[] }>(
      "/api/explore?per_page=40&source=inkwell&showcase=1"
    );
    // One entry per writer, so a single prolific account can't fill the section.
    const seen = new Set<string>();
    return data.data
      .filter((e) => {
        if (!e.title || seen.has(e.author.username)) return false;
        seen.add(e.author.username);
        return true;
      })
      .slice(0, 6);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
interface TransparencySummary {
  founding: { cap: number; remaining: number } | null;
}

async function getTransparency(): Promise<TransparencySummary | null> {
  try {
    const data = await apiFetch<{ data: TransparencySummary }>("/api/transparency");
    return data.data;
  } catch {
    return null;
  }
}

export default async function LandingPage() {
  const [recentEntries, transparency] = await Promise.all([getRecentEntries(), getTransparency()]);
  const founding = transparency?.founding && transparency.founding.remaining > 0 ? transparency.founding : null;
  const foundingSoldOut = transparency?.founding?.remaining === 0;

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
            Writing, reading and connecting on Inkwell are free, with no time limit. Plus is for
            writers who want their own domain, to see who&apos;s reading, and a page that looks like them.
            Members pay for the servers, which is why there are no ads.
          </p>

          <div className="landing-pricing-grid">
            {/* Free */}
            <div className="landing-price-card">
              <p className="landing-price-name">Free</p>
              <p className="landing-price-amount">$0</p>
              <p className="landing-price-note">Always</p>
              <ul className="landing-price-list">
                {[
                  "Unlimited public and private entries",
                  "Import from WordPress, Medium & Substack",
                  "Followable from Mastodon and Bluesky",
                  "Email newsletter up to 500 subscribers",
                  "8 profile themes, privacy controls & RSS",
                  "See how many people read you",
                  "Export everything, any time",
                ].map((item) => (
                  <li key={item}><span aria-hidden="true" style={{ color: "var(--success)" }}>&#10003;</span>{item}</li>
                ))}
              </ul>
              <Link href="/get-started?plan=free" className="landing-price-cta landing-price-cta-outline">
                Start for free
              </Link>
            </div>

            {/* Plus */}
            <div className="landing-price-card landing-plus-card landing-price-card-featured">
              <p className="landing-price-name" style={{ color: "var(--accent)" }}>Inkwell Plus</p>
              <p className="landing-price-amount">
                $5<span className="landing-price-period">/mo</span>
              </p>
              <p className="landing-price-note">or $50 a year &middot; 14 days free, no card</p>
              <ul className="landing-price-list landing-price-list-lead">
                <li>
                  <span aria-hidden="true" style={{ color: "var(--accent)" }}>&#10003;</span>
                  <span><strong>Your own domain.</strong> yourname.com, with your journal behind it.</span>
                </li>
                <li>
                  <span aria-hidden="true" style={{ color: "var(--accent)" }}>&#10003;</span>
                  <span><strong>See who&apos;s reading.</strong> Reads by day, your most-read entries, and where readers came from.</span>
                </li>
                <li>
                  <span aria-hidden="true" style={{ color: "var(--accent)" }}>&#10003;</span>
                  <span><strong>A bigger newsletter.</strong> Unlimited subscribers, 8 sends a month, scheduling.</span>
                </li>
                <li>
                  <span aria-hidden="true" style={{ color: "var(--accent)" }}>&#10003;</span>
                  <span><strong>A page that looks like you.</strong> Custom colors, fonts, layouts, HTML &amp; CSS.</span>
                </li>
              </ul>
              <p className="landing-price-extras">
                Also: 1 GB of images (growing 1 GB a year), unlimited drafts and series,
                cross-posting to Mastodon, Post by Email, and write access to the API.
              </p>
              <Link href="/get-started?plan=plus" className="landing-price-cta">
                Try Plus free for 14 days
              </Link>
            </div>

            {/* Founding (hidden once all 50 are taken) */}
            {!foundingSoldOut && (
            <div className="landing-price-card">
              <p className="landing-price-name">Founding Member</p>
              <p className="landing-price-amount">
                $99<span className="landing-price-period"> once</span>
              </p>
              <p className="landing-price-note">
                {founding
                  ? `${founding.remaining} of ${founding.cap} left`
                  : "Limited to 50"}
              </p>
              <ul className="landing-price-list">
                {[
                  "Plus for as long as Inkwell runs",
                  "A numbered Founding Member badge",
                  "Never billed again",
                  "Helps keep Inkwell independent",
                ].map((item) => (
                  <li key={item}><span aria-hidden="true" style={{ color: "var(--accent)" }}>&#10003;</span>{item}</li>
                ))}
              </ul>
              <Link href="/get-started?plan=founding" className="landing-price-cta landing-price-cta-outline">
                Become a Founding Member
              </Link>
            </div>
            )}
          </div>

          <p className="landing-price-footnote">
            Inkwell&apos;s costs and income are public.{" "}
            <Link href="/transparency" className="underline underline-offset-2" style={{ color: "var(--accent)" }}>
              See where the money goes
            </Link>
            . Prefer to chip in without Plus? <Link href="/settings/billing" className="underline underline-offset-2" style={{ color: "var(--accent)" }}>Ink Donors</Link> give $1&ndash;$3 a month.
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
              <h3 className="landing-colophon-title">Connected by default</h3>
              <p className="landing-colophon-desc">
                Inkwell connects to the fediverse, the network of platforms including Mastodon. Follow writers anywhere. Your journal goes where you go.
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
            Open source (AGPL-3.0) &middot; Built with Elixir and React &middot; Connected via ActivityPub &middot;{" "}
            <a
              href="https://github.com/stantondev/inkwell"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
              style={{ color: "var(--accent)" }}
            >
              View source on GitHub &rarr;
            </a>
          </p>
        </div>
      </section>

      {/* ── Final CTA — "Take Up the Pen" ───────────────────────────── */}
      <FinalCta />

      {/* Footer is rendered by the root layout */}
    </div>
  );
}
