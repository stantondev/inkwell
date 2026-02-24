import type { Metadata } from "next";
import Link from "next/link";
import { FadeInSection, StaggerChild } from "./about-animations";

export const metadata: Metadata = {
  title: "About Inkwell — Our Mission & Values",
  description:
    "Inkwell exists to give people a place to write, think, and connect — without algorithms, without ads, and without a corporation owning their words.",
};

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const BELIEFS = [
  {
    title: "The Internet Deserves Better",
    body: "We are building in direct response to what social media became: platforms optimized for engagement over meaning, for outrage over connection. People deserve tools that serve them rather than exploit them.",
  },
  {
    title: "Profit and Responsibility Are Not Opposites",
    body: "We make money when users find enough value to pay for it. Not by harvesting data, selling attention, or designing systems to create dependence. That alignment is the foundation of everything we build.",
  },
  {
    title: "Open Standards Are Non-Negotiable",
    body: "We build on ActivityPub because users should never be trapped. If Inkwell ever fails to serve you, you can leave and take your identity and connections with you. Federation is a core architectural commitment, not a roadmap item.",
  },
  {
    title: "Community Shapes the Platform",
    body: "The people who show up first matter most. Early users define the culture, surface problems, and point toward what Inkwell should become. Feedback is a conversation, not a support ticket.",
  },
];

const PLEDGES = [
  "Sell user data or share it with advertisers",
  "Introduce algorithmic feeds designed to maximize engagement at the cost of wellbeing",
  "Run ads on the platform",
  "Deliberately cripple the free tier to force paid upgrades",
  "Compromise open federation in exchange for growth or revenue",
  "Prioritize profit in ways that contradict our stated values",
];

const COMMITMENTS = [
  { bold: "Your words belong to you.", rest: "We will never claim ownership over your content." },
  { bold: "Your data is not a product.", rest: "We collect only what we need to operate the platform." },
  { bold: "You can leave at any time.", rest: "Open federation means your identity travels with you." },
  { bold: "We will tell you the truth.", rest: "When we make mistakes, we will say so. When something changes, we will explain why." },
  { bold: "We build with you, not just for you.", rest: "The community shapes the roadmap." },
];

const REVENUE_COMMITMENTS = [
  "Reinvesting in the platform — infrastructure, features, stability, and the team that makes it possible.",
  "Donating a meaningful portion of profits to sustainable technology, equality and internet access, and open source infrastructure.",
  "Being transparent about how money flows through the business, so the community can hold us accountable.",
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AboutPage() {
  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <FadeInSection as="section" className="mx-auto max-w-3xl px-4 pt-20 pb-16">
        <p
          className="text-xs font-medium uppercase tracking-widest mb-6"
          style={{ color: "var(--accent)" }}
        >
          Our Mission
        </p>
        <h1
          className="text-2xl sm:text-4xl lg:text-5xl font-bold leading-tight mb-8"
          style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
        >
          Why Inkwell Exists
        </h1>
        <blockquote
          className="border-l-4 pl-4 sm:pl-6 py-2 text-base sm:text-xl leading-relaxed"
          style={{
            borderColor: "var(--accent)",
            color: "var(--muted)",
            fontFamily: "var(--font-lora, Georgia, serif)",
          }}
        >
          Inkwell exists to give people a place to write, think, and connect —
          without an algorithm deciding what matters, without ads harvesting
          their attention, and without a corporation owning their words.
        </blockquote>
        <p
          className="text-sm mt-8"
          style={{ color: "var(--muted)" }}
        >
          Version 1.0 &middot; February 24, 2026
        </p>
      </FadeInSection>

      {/* ── What We Are ───────────────────────────────────────────────── */}
      <FadeInSection
        as="section"
        className="border-y py-16"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div className="mx-auto max-w-3xl px-4">
          <h2
            className="text-2xl sm:text-3xl font-semibold mb-6"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            What We Are
          </h2>
          <p className="text-base leading-relaxed mb-4">
            Inkwell is a federated social journaling platform — a place built
            for writing: journal entries, long thoughts, personal updates, and
            creative expression. Where the people you care about can actually
            read what you write.
          </p>
          <p className="text-base leading-relaxed mb-6">
            Built on ActivityPub — the same open standard that powers Mastodon
            and a growing ecosystem of independent platforms — your content
            belongs to you, not to us. No single company, including ours, can
            own or control your presence on it.
          </p>
          <div className="flex flex-wrap gap-2">
            {["Federated", "Ad-free", "Algorithm-free"].map((label) => (
              <span
                key={label}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border"
                style={{
                  borderColor: "var(--accent)",
                  color: "var(--accent)",
                  background: "var(--accent-light)",
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: "var(--accent)" }}
                  aria-hidden="true"
                />
                {label}
              </span>
            ))}
          </div>
        </div>
      </FadeInSection>

      {/* ── What We Believe ────────────────────────────────────────────── */}
      <section className="mx-auto max-w-4xl px-4 py-20">
        <FadeInSection>
          <h2
            className="text-2xl sm:text-3xl font-semibold text-center mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            What We Believe
          </h2>
          <p
            className="text-base leading-relaxed text-center mb-12 max-w-2xl mx-auto"
            style={{ color: "var(--muted)" }}
          >
            These are the principles that guide every decision we make — from
            what we build to how we run the business.
          </p>
        </FadeInSection>

        <div className="grid gap-5 sm:grid-cols-2">
          {BELIEFS.map((belief, i) => (
            <StaggerChild
              key={belief.title}
              index={i}
              className="rounded-xl border p-6 flex flex-col gap-3"
              style={{
                borderColor: "var(--border)",
                background: "var(--surface)",
                borderTop: "3px solid var(--accent)",
              }}
            >
              <h3
                className="text-lg font-semibold"
                style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
              >
                {belief.title}
              </h3>
              <p
                className="text-sm leading-relaxed"
                style={{ color: "var(--muted)" }}
              >
                {belief.body}
              </p>
            </StaggerChild>
          ))}
        </div>
      </section>

      {/* ── How We Sustain This ─────────────────────────────────────── */}
      <FadeInSection
        as="section"
        className="border-y py-16"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div className="mx-auto max-w-3xl px-4">
          <h2
            className="text-2xl sm:text-3xl font-semibold mb-6"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            How We Sustain This
          </h2>
          <p className="text-base leading-relaxed mb-4">
            Inkwell operates on a freemium subscription model. The core
            platform — writing, reading, following, connecting — is free.{" "}
            <Link
              href="/settings/billing"
              className="underline underline-offset-2"
              style={{ color: "var(--accent)" }}
            >
              Inkwell Plus
            </Link>{" "}
            at{" "}
            <strong style={{ color: "var(--accent)" }}>$5/month</strong>{" "}
            unlocks custom themes, HTML/CSS, the supporter stamp, and more.
          </p>
          <p className="text-base leading-relaxed mb-8">
            Subscriptions align our success with user value. When you pay for
            Plus, it&apos;s because Inkwell is worth it — not because we
            engineered an addiction or locked away features you need to
            function.
          </p>

          <p
            className="text-sm font-medium uppercase tracking-widest mb-4"
            style={{ color: "var(--accent)" }}
          >
            Where revenue goes
          </p>
          <ol className="flex flex-col gap-4">
            {REVENUE_COMMITMENTS.map((item, i) => (
              <li key={i} className="flex gap-4 items-start">
                <span
                  className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold"
                  style={{
                    background: "var(--accent-light)",
                    color: "var(--accent)",
                  }}
                >
                  {i + 1}
                </span>
                <p className="text-sm leading-relaxed pt-0.5" style={{ color: "var(--muted)" }}>
                  {item}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </FadeInSection>

      {/* ── What We Will Never Do — Pledge Wall ────────────────────── */}
      <section className="py-20">
        <div className="mx-auto max-w-3xl px-4">
          <FadeInSection>
            <h2
              className="text-2xl sm:text-3xl font-semibold text-center mb-3"
              style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
            >
              What We Will Never Do
            </h2>
            <p
              className="text-base leading-relaxed text-center mb-12 max-w-2xl mx-auto"
              style={{ color: "var(--muted)" }}
            >
              These are not aspirations. They are constraints we place on
              ourselves, stated publicly so our community can hold us to them.
            </p>
          </FadeInSection>

          <div className="flex flex-col gap-3">
            {PLEDGES.map((pledge, i) => (
              <StaggerChild
                key={i}
                index={i}
                className="flex items-start gap-4 rounded-xl border p-4 sm:p-5"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--surface)",
                }}
              >
                <span
                  className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-base font-bold"
                  style={{
                    background: "color-mix(in srgb, var(--danger) 10%, transparent)",
                    color: "var(--danger)",
                  }}
                  aria-hidden="true"
                >
                  &times;
                </span>
                <p className="text-base leading-relaxed pt-0.5">
                  {pledge}
                </p>
              </StaggerChild>
            ))}
          </div>
        </div>
      </section>

      {/* ── Our Commitments ────────────────────────────────────────── */}
      <FadeInSection
        as="section"
        className="border-y py-16"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div className="mx-auto max-w-3xl px-4">
          <h2
            className="text-2xl sm:text-3xl font-semibold mb-10"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            Our Commitments to You
          </h2>

          <div className="flex flex-col gap-4">
            {COMMITMENTS.map((c, i) => (
              <div key={i} className="flex items-start gap-4">
                <span
                  className="flex-shrink-0 mt-0.5 text-lg"
                  style={{ color: "var(--accent)" }}
                  aria-hidden="true"
                >
                  &#10003;
                </span>
                <p className="text-base leading-relaxed">
                  <strong>{c.bold}</strong>{" "}
                  <span style={{ color: "var(--muted)" }}>{c.rest}</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      </FadeInSection>

      {/* ── Closing ────────────────────────────────────────────────── */}
      <FadeInSection as="section" className="mx-auto max-w-3xl px-4 py-20">
        <blockquote
          className="border-l-4 pl-6 py-3 mb-10"
          style={{
            borderColor: "var(--accent)",
            fontFamily: "var(--font-lora, Georgia, serif)",
          }}
        >
          <p
            className="text-lg sm:text-xl leading-relaxed italic"
            style={{ color: "var(--muted)" }}
          >
            Inkwell is an attempt to prove that a social platform can be good
            for people and financially sustainable at the same time. We think
            that is worth building.
          </p>
        </blockquote>

        <p
          className="text-sm leading-relaxed mb-2"
          style={{ color: "var(--muted)" }}
        >
          This document is a living reference. It will be updated as the
          platform and business evolve.
        </p>

        <div
          className="flex flex-wrap gap-x-4 gap-y-1 text-sm mt-6"
          style={{ color: "var(--muted)" }}
        >
          <Link
            href="/terms"
            className="underline underline-offset-2"
            style={{ color: "var(--accent)" }}
          >
            Terms of Service
          </Link>
          <span aria-hidden="true">&middot;</span>
          <Link
            href="/privacy"
            className="underline underline-offset-2"
            style={{ color: "var(--accent)" }}
          >
            Privacy Policy
          </Link>
          <span aria-hidden="true">&middot;</span>
          <Link
            href="/roadmap"
            className="underline underline-offset-2"
            style={{ color: "var(--accent)" }}
          >
            Community Roadmap
          </Link>
        </div>
      </FadeInSection>
    </div>
  );
}
