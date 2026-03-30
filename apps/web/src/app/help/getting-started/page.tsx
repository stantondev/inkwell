import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "First Pages — Inkwell Help Center",
  description:
    "Step-by-step guides to help you get started with Inkwell — your first entry, finding people, and making it yours.",
  openGraph: {
    title: "First Pages — Inkwell Help Center",
    description:
      "Step-by-step guides to help you get started with Inkwell — your first entry, finding people, and making it yours.",
    url: "https://inkwell.social/help/getting-started",
  },
  alternates: { canonical: "https://inkwell.social/help/getting-started" },
};

/* ── section wrapper ──────────────────────────────────────────────── */
function Section({
  id,
  number,
  title,
  children,
}: {
  id: string;
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <div
        className="rounded-xl border p-6 sm:p-8"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <p
          className="text-xs uppercase tracking-widest mb-1"
          style={{ color: "var(--accent)", fontFamily: "var(--font-lora, Georgia, serif)" }}
        >
          {number}
        </p>
        <h2
          className="text-xl font-bold mb-4"
          style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
        >
          {title}
        </h2>
        <div className="space-y-3 text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
          {children}
        </div>
      </div>
    </section>
  );
}

/* ── page ─────────────────────────────────────────────────────────── */
export default function GettingStartedPage() {
  return (
    <main
      className="mx-auto max-w-3xl px-4 py-12"
      style={{ color: "var(--foreground)" }}
    >
      {/* Breadcrumb */}
      <p className="text-xs mb-4" style={{ color: "var(--muted)" }}>
        <Link href="/help" className="hover:underline" style={{ color: "var(--accent)" }}>
          Help Center
        </Link>
        {" "}/ First Pages
      </p>

      <p
        className="text-xs uppercase tracking-widest mb-1"
        style={{ color: "var(--accent)", fontFamily: "var(--font-lora, Georgia, serif)" }}
      >
        Getting Started
      </p>
      <h1
        className="text-3xl font-bold mb-2"
        style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
      >
        First Pages
      </h1>
      <p className="text-sm mb-8" style={{ color: "var(--muted)" }}>
        Everything you need to start writing on Inkwell
      </p>

      <div className="space-y-6">
        {/* ── Section I ── */}
        <Section id="first-entry" number="I" title="Your First Entry">
          <p>
            <strong>Create your account.</strong> Visit{" "}
            <Link href="/get-started" className="underline" style={{ color: "var(--accent)" }}>
              Get Started
            </Link>{" "}
            and enter your email. We&rsquo;ll send a magic link — click it to sign in instantly.
            No password needed.
          </p>
          <p>
            <strong>Complete onboarding.</strong> Choose a username, upload an avatar (or build one
            with our avatar builder), write a short bio, pick a theme, and read through the
            community guidelines.
          </p>
          <p>
            <strong>Open the editor.</strong> Click <strong>Write</strong> in the sidebar (or tap
            the pen icon on mobile). You&rsquo;ll see a clean, notebook-style writing area with
            ruled lines.
          </p>
          <p>
            <strong>Write something.</strong> Give your entry a title and start writing. The rich
            text editor supports bold, italic, links, images, tables, task lists, and more. Use
            the floating toolbar that appears when you select text.
          </p>
          <p>
            <strong>Set visibility and publish.</strong> In the settings panel on the right, choose
            who can see your entry — Public, Friends Only, Private, or a Custom Filter. Then hit{" "}
            <strong>Publish</strong>.
          </p>
        </Section>

        {/* ── Section II ── */}
        <Section id="finding-people" number="II" title="Finding Your People">
          <p>
            <strong>Explore.</strong> The{" "}
            <Link href="/explore" className="underline" style={{ color: "var(--accent)" }}>
              Explore
            </Link>{" "}
            page shows all public entries across Inkwell and the fediverse. Browse by category,
            search for topics, or sort by Most Inked to find popular writing.
          </p>
          <p>
            <strong>Follow writers.</strong> Visit anyone&rsquo;s profile and click{" "}
            <strong>Follow</strong> to add them as a pen pal. Their entries will appear in your
            Feed.
          </p>
          <p>
            <strong>Pen pals.</strong> When two people follow each other, they become pen pals.
            Pen pals can send each other private letters and see friends-only entries.
          </p>
          <p>
            <strong>Feed vs Explore.</strong> Your{" "}
            <Link href="/feed" className="underline" style={{ color: "var(--accent)" }}>
              Feed
            </Link>{" "}
            is personal — it shows entries only from people you follow. Explore is public and
            shows everything.
          </p>
        </Section>

        {/* ── Section III ── */}
        <Section id="customization" number="III" title="Making It Yours">
          <p>
            <strong>Choose a theme.</strong> Inkwell has 8 structural themes — each with unique
            typography, colors, and decorative elements. Go to{" "}
            <Link href="/settings/customize" className="underline" style={{ color: "var(--accent)" }}>
              Settings → Customize
            </Link>{" "}
            to try them.
          </p>
          <p>
            <strong>Build your avatar.</strong> Don&rsquo;t want to upload a photo? Use our
            hand-drawn avatar builder to create a unique character in two art styles.
          </p>
          <p>
            <strong>Set a status.</strong> Add a short status message (like an AIM away message)
            that appears below your name on your profile.
          </p>
          <p>
            <strong>Plus customization.</strong> With{" "}
            <Link href="/settings/billing" className="underline" style={{ color: "var(--accent)" }}>
              Inkwell Plus
            </Link>{" "}
            ($5/mo), you get custom colors, fonts, layouts, background images, profile music,
            custom HTML/CSS, custom domains, premium avatar frames, and animated avatars.
          </p>
        </Section>

        {/* ── Section IV ── */}
        <Section id="engagement" number="IV" title="Engaging With Writing">
          <p>
            <strong>Stamps.</strong> Press an ink stamp on entries to share how they made you feel.
            There are 7 stamp types — each appears like a real postage stamp on the entry.
          </p>
          <p>
            <strong>Inks.</strong> Ink entries to help surface great writing for the community.
            The most-inked entries appear in the &ldquo;Trending This Week&rdquo; section on Explore.
          </p>
          <p>
            <strong>Reprints.</strong> Share entries with your followers like a repost. You can do
            a simple reprint or a quote reprint with your own thoughts.
          </p>
          <p>
            <strong>Comments (Marginalia).</strong> Leave threaded comments on entries. You can
            @mention other users, format with bold and italic, and include links.
          </p>
          <p>
            <strong>Bookmarks.</strong> Save entries to your private reading list for later.
          </p>
        </Section>

        {/* ── Section V ── */}
        <Section id="fediverse" number="V" title="Joining the Fediverse">
          <p>
            <strong>What is it?</strong> The fediverse is a network of independent platforms
            (Mastodon, Pixelfed, Lemmy, and more) connected through a protocol called ActivityPub.
            Inkwell is part of this network.
          </p>
          <p>
            <strong>Your handle.</strong> Your fediverse handle is{" "}
            <code style={{ background: "var(--background)", padding: "2px 6px", borderRadius: 4, fontSize: "0.85em" }}>
              @username@inkwell.social
            </code>
            . Share it with anyone on the fediverse so they can follow you.
          </p>
          <p>
            <strong>Cross-platform following.</strong> Mastodon users can follow you, and their
            boosts, favorites, and replies will appear on Inkwell. Your public entries are visible
            to anyone on the fediverse.
          </p>
          <p>
            <strong>Cross-posting.</strong> If you link a Mastodon account in{" "}
            <Link href="/settings/fediverse" className="underline" style={{ color: "var(--accent)" }}>
              Settings → Fediverse
            </Link>
            , you can cross-post a preview of your entries to your Mastodon timeline when you publish.
          </p>
        </Section>

        {/* ── Section VI ── */}
        <Section id="earning" number="VI" title="Earning From Your Writing">
          <p>
            <strong>Postage.</strong> Readers can send you one-time payments as a thank-you for
            your writing. Enable this by connecting a Stripe account in{" "}
            <Link href="/settings/support" className="underline" style={{ color: "var(--accent)" }}>
              Settings → Support
            </Link>{" "}
            (Plus required).
          </p>
          <p>
            <strong>Writer subscriptions.</strong> Create a paid monthly plan for exclusive
            content. Subscribers get access to entries you mark as &ldquo;Paid subscribers
            only&rdquo; in the editor.
          </p>
          <p>
            <strong>Newsletters.</strong> Enable a newsletter in{" "}
            <Link href="/settings/newsletter" className="underline" style={{ color: "var(--accent)" }}>
              Settings → Newsletter
            </Link>{" "}
            and send published entries to your email subscribers.
          </p>
        </Section>
      </div>

      {/* Bottom links */}
      <div className="mt-12 pt-6 border-t" style={{ borderColor: "var(--border)" }}>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Want to learn more?{" "}
          <Link href="/guide" className="underline" style={{ color: "var(--accent)" }}>
            Read the full Guide
          </Link>{" "}
          or{" "}
          <Link href="/help/faq" className="underline" style={{ color: "var(--accent)" }}>
            browse the FAQ
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
