import Link from "next/link";
import { apiFetch } from "@/lib/api";

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
    // Only show local entries with titles (better for showcase)
    return data.data
      .filter((e) => e.source === "local" && e.title)
      .slice(0, 6);
  } catch {
    return [];
  }
}

function formatCategory(cat: string): string {
  return cat
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function getReadingTime(wordCount: number): string {
  const minutes = Math.max(1, Math.ceil(wordCount / 250));
  return `${minutes} min read`;
}

function getExcerpt(entry: ExploreEntry): string {
  if (entry.excerpt) return entry.excerpt;
  // Strip HTML tags and decode HTML entities for a raw text preview
  const text = entry.body_html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
  if (text.length <= 120) return text;
  return text.slice(0, 120).trimEnd() + "…";
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default async function LandingPage() {
  const recentEntries = await getRecentEntries();
  return (
    <div className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 pt-20 pb-16 text-center">
        <div
          className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium mb-8 border"
          style={{
            borderColor: "var(--accent)",
            color: "var(--accent)",
            background: "var(--accent-light)",
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--accent)" }} aria-hidden="true" />
          Free forever · federated · no ads, ever
        </div>

        <h1
          className="text-3xl sm:text-5xl lg:text-6xl font-semibold leading-tight tracking-tight mb-6"
          style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
        >
          Your journal.
          <br />
          <span style={{ color: "var(--accent)" }}>Your pen pals.</span>
          <br />
          Your space.
        </h1>

        <p
          className="max-w-xl mx-auto text-base sm:text-lg leading-relaxed mb-10"
          style={{ color: "var(--muted)" }}
        >
          Inkwell is a federated social journaling platform — the richness of
          LiveJournal, the creativity of early MySpace, rebuilt for 2026 on open
          standards with no algorithm and no ads.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/get-started"
            className="inline-flex items-center justify-center rounded-full px-6 py-3 text-base font-medium transition-all"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            Start writing
          </Link>
          <Link
            href="/explore"
            className="inline-flex items-center justify-center rounded-full px-6 py-3 text-base font-medium border transition-colors"
            style={{
              borderColor: "var(--border-strong)",
              color: "var(--foreground)",
            }}
          >
            Read the feed
          </Link>
        </div>
      </section>

      {/* ── Pricing ───────────────────────────────────────────────────── */}
      <section
        className="border-y py-16"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div className="mx-auto max-w-4xl px-4 text-center">
          <h2
            className="text-3xl font-semibold mb-4"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            Free, always. Plus for those who want more.
          </h2>
          <p className="text-base leading-relaxed mb-10" style={{ color: "var(--muted)" }}>
            Inkwell is free to use — no trial, no expiry, no bait-and-switch. We&apos;re building
            something different: no ads, no algorithms, no big tech. Inkwell Plus ($5/mo) unlocks
            power-user features for those who want more, and helps sustain the platform for everyone.
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
                  "Word count & reading time",
                  "Distraction-free writing mode",
                  "Data import (WordPress, Medium, Substack & more)",
                  "Pen Pal filters (up to 5)",
                  "Top 6 pen pals",
                  "100 MB image storage",
                  "Up to 10 drafts",
                  "Status message",
                  "RSS feed",
                ].map((item) => (
                  <li key={item} className="flex gap-2 items-start">
                    <span style={{ color: "var(--success)" }} aria-hidden="true">&#10003;</span>
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                href="/get-started"
                className="mt-6 block text-center rounded-full py-2 text-sm font-medium transition-opacity hover:opacity-80"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                Start for free
              </Link>
            </div>
            {/* Plus tier */}
            <div
              className="w-full sm:flex-1 sm:max-w-xs rounded-2xl border-2 p-5 sm:p-6 text-left relative overflow-hidden"
              style={{ borderColor: "var(--accent)", background: "var(--background)" }}
            >
              <div className="absolute top-3 right-3 rounded-full px-2 py-0.5 text-xs font-medium"
                style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                Best value
              </div>
              <p className="text-sm font-medium mb-1" style={{ color: "var(--accent)" }}>Inkwell Plus</p>
              <p className="text-3xl font-bold mb-4">
                $5
                <span className="text-base font-normal" style={{ color: "var(--muted)" }}>/mo</span>
              </p>
              <ul className="space-y-2 text-sm" style={{ color: "var(--muted)" }}>
                {[
                  "Everything in Free",
                  "Unlimited version history",
                  "Unlimited series & collections",
                  "1 GB image storage",
                  "Unlimited drafts",
                  "Unlimited pen pal filters",
                  "Custom colors, fonts & layouts",
                  "Background images & profile music",
                  "Widget reordering",
                  "Custom HTML & CSS",
                  "Supporter stamp",
                  "Plus badge on your profile",
                  "Priority support",
                ].map((item) => (
                  <li key={item} className="flex gap-2 items-start">
                    <span style={{ color: "var(--accent)" }} aria-hidden="true">&#10003;</span>
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                href="/get-started"
                className="mt-6 block text-center rounded-full py-2 text-sm font-medium transition-opacity hover:opacity-80"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                Get started
              </Link>
              <p className="text-xs text-center mt-3" style={{ color: "var(--muted)" }}>
                Upgrade to Plus anytime from your settings
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Recent from the Community ──────────────────────────────── */}
      {recentEntries.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-20">
          <p
            className="text-xs font-medium uppercase tracking-widest mb-2 text-center"
            style={{ color: "var(--muted)" }}
          >
            Fresh from the community
          </p>
          <h2
            className="text-2xl sm:text-3xl font-semibold text-center mb-10"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            See what people are writing
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recentEntries.map((entry) => {
              const entryUrl = `/${entry.author.username}/${entry.slug ?? entry.id}`;
              return (
                <Link
                  key={entry.id}
                  href={entryUrl}
                  className="rounded-xl border p-5 flex flex-col gap-3 transition-colors hover:border-[var(--accent)]"
                  style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                >
                  {/* Cover image */}
                  {entry.cover_image_id && (
                    <div className="rounded-lg overflow-hidden -mx-1 -mt-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/images/${entry.cover_image_id}`}
                        alt=""
                        className="w-full h-32 object-cover"
                      />
                    </div>
                  )}
                  {/* Title */}
                  <h3
                    className="font-semibold text-base leading-snug line-clamp-2"
                    style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
                  >
                    {entry.title}
                  </h3>
                  {/* Excerpt */}
                  <p
                    className="text-sm leading-relaxed line-clamp-3 flex-1"
                    style={{ color: "var(--muted)" }}
                  >
                    {getExcerpt(entry)}
                  </p>
                  {/* Footer: author + meta */}
                  <div className="flex items-center gap-2 pt-1">
                    {entry.author.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={entry.author.avatar_url}
                        alt=""
                        className="w-6 h-6 rounded-full object-cover"
                      />
                    ) : (
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium"
                        style={{ background: "var(--accent-light)", color: "var(--accent)" }}
                      >
                        {(entry.author.display_name || entry.author.username).charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="text-sm font-medium truncate">
                      {entry.author.display_name || entry.author.username}
                    </span>
                    <span className="text-xs ml-auto flex-shrink-0" style={{ color: "var(--muted)" }}>
                      {entry.word_count > 0 && getReadingTime(entry.word_count)}
                      {entry.word_count > 0 && entry.category && " · "}
                      {entry.category && formatCategory(entry.category)}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
          <div className="text-center mt-8">
            <Link
              href="/explore"
              className="inline-flex items-center justify-center rounded-full px-6 py-2.5 text-sm font-medium border transition-colors hover:opacity-80"
              style={{
                borderColor: "var(--accent)",
                color: "var(--accent)",
              }}
            >
              Explore more entries &rarr;
            </Link>
          </div>
        </section>
      )}

      {/* ── Mission Teaser ──────────────────────────────────────────── */}
      <section
        className="border-y py-14"
        style={{ borderColor: "var(--border)", background: "var(--accent-light)" }}
      >
        <div className="mx-auto max-w-3xl px-4 text-center">
          <p
            className="text-lg sm:text-xl leading-relaxed italic mb-6"
            style={{
              fontFamily: "var(--font-lora, Georgia, serif)",
              color: "var(--foreground)",
            }}
          >
            &ldquo;We believe the internet was at its best when it felt like a
            place people genuinely lived. Long-form writing. Personal pages. The
            sense that you were getting to know someone.&rdquo;
          </p>
          <Link
            href="/about"
            className="inline-flex items-center justify-center rounded-full px-6 py-2.5 text-sm font-medium border transition-colors hover:opacity-80"
            style={{
              borderColor: "var(--accent)",
              color: "var(--accent)",
            }}
          >
            Read our mission &rarr;
          </Link>
        </div>
      </section>

      {/* ── Built in the Open ────────────────────────────────────────── */}
      <section
        className="border-t py-16"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div className="mx-auto max-w-5xl px-4">
          <h2
            className="text-3xl font-semibold text-center mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            Built in the open
          </h2>
          <p
            className="text-base leading-relaxed text-center mb-12 max-w-2xl mx-auto"
            style={{ color: "var(--muted)" }}
          >
            Inkwell isn&apos;t a black box. We build with our community, federate with the open web, and put every decision where you can see it.
          </p>

          <div className="grid gap-6 sm:grid-cols-3">
            {/* ActivityPub */}
            <div className="flex flex-col items-center text-center gap-3">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ background: "var(--accent-light)", color: "var(--accent)" }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                </svg>
              </div>
              <h3 className="font-semibold" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
                Federated by default
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                Inkwell speaks ActivityPub. Follow writers on Mastodon, Ghost, and any platform on the open social web. Your journal isn&apos;t trapped here.
              </p>
            </div>

            {/* Community roadmap */}
            <div className="flex flex-col items-center text-center gap-3">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ background: "var(--accent-light)", color: "var(--accent)" }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                </svg>
              </div>
              <h3 className="font-semibold" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
                Community roadmap
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                Every feature is proposed, discussed, and prioritized by the people who use Inkwell.{" "}
                <Link href="/roadmap" className="underline underline-offset-2" style={{ color: "var(--accent)" }}>
                  See what&apos;s next
                </Link>
                .
              </p>
            </div>

            {/* No ads, no algorithm */}
            <div className="flex flex-col items-center text-center gap-3">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ background: "var(--accent-light)", color: "var(--accent)" }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
              <h3 className="font-semibold" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
                Your data stays yours
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                No ads. No tracking. No algorithm deciding what you see. Inkwell is sustained by its community, not by selling your attention.{" "}
                <Link href="/privacy" className="underline underline-offset-2" style={{ color: "var(--accent)" }}>
                  Read our privacy policy
                </Link>
                .
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer is rendered by the root layout */}
    </div>
  );
}
