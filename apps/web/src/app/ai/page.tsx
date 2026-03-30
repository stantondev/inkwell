import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "AI Policy — Inkwell",
  description:
    "How Inkwell uses AI responsibly, protects your content from AI training, and champions authentic human writing.",
  openGraph: {
    title: "AI Policy — Inkwell",
    description:
      "How Inkwell uses AI responsibly, protects your content from AI training, and champions authentic human writing.",
    url: "https://inkwell.social/ai",
  },
  alternates: { canonical: "https://inkwell.social/ai" },
};

export default function AIPage() {
  return (
    <main
      className="mx-auto max-w-3xl px-4 py-12"
      style={{ color: "var(--foreground)" }}
    >
      <p
        className="text-xs font-medium uppercase tracking-widest mb-2"
        style={{ color: "var(--accent)" }}
      >
        Policy
      </p>
      <h1
        className="text-3xl font-bold mb-2"
        style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
      >
        AI Policy
      </h1>
      <p className="text-sm mb-10" style={{ color: "var(--muted)" }}>
        Last Updated: March 30, 2026
      </p>

      <div className="prose-legal flex flex-col gap-8 text-base leading-relaxed">
        <p>
          Inkwell is a platform built for human expression. We believe in
          transparency about how AI is used on our platform, and we are
          committed to protecting your writing from unauthorized use by AI
          systems. This policy explains what we do, what we don&rsquo;t do, and
          how we protect your content.
        </p>

        {/* 1. How We Use AI */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            1. How We Use AI
          </h2>
          <p className="mb-3">
            We believe in being upfront about our use of AI. Here is everywhere
            AI touches Inkwell:
          </p>
          <ul className="list-disc pl-6 flex flex-col gap-3">
            <li>
              <strong>Platform development.</strong> We use Claude (by Anthropic)
              to assist with writing code, documentation, and debugging during
              development of the Inkwell platform. AI helps us build faster, but
              every decision is made by a human.
            </li>
            <li>
              <strong>Inkwell Muse (@muse).</strong> Muse is our official
              AI-powered writing prompt bot. It uses Claude Haiku to generate
              daily writing prompts, weekly community roundups, and monthly
              platform updates. Every Muse entry is{" "}
              <strong>clearly labeled as AI-generated</strong> with a visible
              badge on all feed cards and entry pages. Muse exists to spark your
              writing &mdash; it is not a ghostwriter, and it does not create
              content on behalf of users.
            </li>
            <li>
              <strong>Content translation.</strong> We use the DeepL API to
              provide on-demand translation of entries and comments. DeepL
              processes text for translation only &mdash; it does not store or
              train on your content.
            </li>
          </ul>
          <p className="mt-3">
            That&rsquo;s the complete list. No AI writes user content, no AI
            moderates without human review, no AI generates fake profiles or
            engagement.
          </p>
        </section>

        {/* 2. How We Don't Use AI */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            2. How We Don&rsquo;t Use AI
          </h2>
          <div
            className="rounded-xl border p-4"
            style={{
              borderColor: "var(--accent)",
              background: "var(--accent-light)",
            }}
          >
            <p
              className="font-semibold text-sm mb-2"
              style={{ color: "var(--accent)" }}
            >
              Inkwell does NOT:
            </p>
            <ul
              className="text-sm flex flex-col gap-1.5"
              style={{ color: "var(--accent)" }}
            >
              <li>
                Use AI to generate, edit, or suggest changes to your writing
              </li>
              <li>Train AI models on user content</li>
              <li>
                Sell, license, or provide user content to AI companies for
                training
              </li>
              <li>
                Use AI for content recommendation or algorithmic feeds &mdash;
                Inkwell is chronological by design
              </li>
              <li>Use AI for automated moderation decisions</li>
              <li>
                Use AI to analyze your writing style, reading habits, or
                behavior for profiling
              </li>
            </ul>
          </div>
        </section>

        {/* 3. Authentic Writing */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            3. Authentic Writing
          </h2>
          <p className="mb-3">
            Inkwell is a platform for human expression. We encourage everyone to
            write in their own voice &mdash; your perspectives, your
            experiences, your words.
          </p>
          <ul className="list-disc pl-6 flex flex-col gap-3">
            <li>
              <strong>AI-assisted tools are welcome.</strong> Grammar checkers,
              spell checkers, translation tools, and accessibility aids are all
              fine. These tools help you express yourself more clearly &mdash;
              they don&rsquo;t replace your voice.
            </li>
            <li>
              <strong>AI-generated content should be disclosed.</strong> If you
              use AI to substantially generate an entry, we ask that you label it
              clearly. Transparency builds trust within the community.
            </li>
            <li>
              <strong>
                Fully automated AI accounts are not permitted.
              </strong>{" "}
              The only automated AI account on Inkwell is the official Muse bot,
              which is clearly identified. Accounts that post AI-generated
              content without human curation may be removed.
            </li>
          </ul>
          <p className="mt-3">
            This is not an anti-AI stance &mdash; it&rsquo;s a
            pro-human-writing stance. Inkwell is a place for{" "}
            <em>your</em> words.
          </p>
        </section>

        {/* 4. Protecting Your Content */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            4. Protecting Your Content
          </h2>
          <p className="mb-3">
            We take active measures to protect your writing from being used to
            train AI models:
          </p>
          <ul className="list-disc pl-6 flex flex-col gap-3">
            <li>
              <strong>Crawler blocking.</strong> Our{" "}
              <code className="text-sm px-1 py-0.5 rounded" style={{ background: "var(--surface)" }}>
                robots.txt
              </code>{" "}
              blocks all known AI training crawlers, including GPTBot,
              ClaudeBot, CCBot, Google-Extended, and over a dozen others.
            </li>
            <li>
              <strong>Legal prohibition.</strong> Our{" "}
              <Link
                href="/terms"
                className="underline underline-offset-2"
                style={{ color: "var(--accent)" }}
              >
                Terms of Service
              </Link>{" "}
              (Section 7) explicitly prohibit scraping Inkwell for AI training
              purposes, regardless of the method used.
            </li>
            <li>
              <strong>Active monitoring.</strong> We monitor access patterns and
              block unauthorized crawling when detected.
            </li>
            <li>
              <strong>Pursuit of removal.</strong> If we discover that a service
              has scraped user content from Inkwell for AI training, we will
              pursue removal through all available channels.
            </li>
          </ul>
          <p className="mt-3" style={{ color: "var(--muted)" }}>
            No technical measure is foolproof. Compliant crawlers honor{" "}
            <code className="text-sm px-1 py-0.5 rounded" style={{ background: "var(--surface)" }}>
              robots.txt
            </code>
            , but bad actors may not. That&rsquo;s why we combine technical
            blocking with legal prohibition &mdash; so we have both a fence and
            a legal remedy.
          </p>
        </section>

        {/* 5. The Fediverse & AI */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            5. The Fediverse &amp; AI
          </h2>
          <p className="mb-3">
            Inkwell is part of the fediverse &mdash; a network of independent
            platforms connected through ActivityPub. This has implications for
            content protection:
          </p>
          <ul className="list-disc pl-6 flex flex-col gap-3">
            <li>
              Content shared via ActivityPub is inherently public and federated
              to other servers. We block AI crawlers on our infrastructure, but
              we cannot enforce this on federated copies hosted by other
              instances.
            </li>
            <li>
              We encourage other fediverse instance administrators to similarly
              protect user content from AI training.
            </li>
            <li>
              Users who want maximum protection can use{" "}
              <strong>friends-only</strong> or <strong>private</strong> visibility
              settings, which prevent content from being federated at all.
            </li>
          </ul>
        </section>

        {/* 6. Our Commitment */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            6. Our Commitment
          </h2>
          <ul className="list-disc pl-6 flex flex-col gap-3">
            <li>
              We will update this policy as the AI landscape evolves.
            </li>
            <li>
              We will always disclose how AI is used on the platform.
            </li>
            <li>
              We will never secretly train on or sell user content to AI
              companies.
            </li>
            <li>
              If our position on AI changes in any material way, users will be
              notified before any change takes effect.
            </li>
          </ul>
        </section>

        {/* Bottom links */}
        <div
          className="border-t pt-6 mt-4"
          style={{ borderColor: "var(--border)" }}
        >
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Questions about this policy?{" "}
            <Link
              href="/help/contact"
              className="underline underline-offset-2"
              style={{ color: "var(--accent)" }}
            >
              Contact us
            </Link>
            . See also our{" "}
            <Link
              href="/terms"
              className="underline underline-offset-2"
              style={{ color: "var(--accent)" }}
            >
              Terms of Service
            </Link>
            ,{" "}
            <Link
              href="/privacy"
              className="underline underline-offset-2"
              style={{ color: "var(--accent)" }}
            >
              Privacy Policy
            </Link>
            , and{" "}
            <Link
              href="/guidelines"
              className="underline underline-offset-2"
              style={{ color: "var(--accent)" }}
            >
              Community Guidelines
            </Link>
            .
          </p>
        </div>
      </div>
    </main>
  );
}
