import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "For Writers — Earn from Your Writing on Inkwell",
  description:
    "Create a monthly subscription plan, publish paid entries, and earn recurring revenue from your writing. You keep 92% — no algorithms, no lock-in.",
  openGraph: {
    title: "For Writers — Earn from Your Writing on Inkwell",
    description:
      "Create a monthly subscription plan and earn recurring revenue from your writing. You keep 92%.",
    url: "https://inkwell.social/for-writers",
    type: "website",
  },
  twitter: {
    card: "summary",
    site: "@inkwellsocial",
    title: "For Writers — Earn from Your Writing",
    description: "Create paid subscriptions on Inkwell. You keep 92%.",
  },
  alternates: { canonical: "https://inkwell.social/for-writers" },
};

export default function ForWritersPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      {/* Hero */}
      <section className="py-16 sm:py-24 px-4 text-center">
        <div className="mx-auto max-w-3xl">
          <p
            className="text-sm font-medium tracking-widest uppercase mb-4"
            style={{ color: "var(--accent)", letterSpacing: "0.15em" }}
          >
            For Writers
          </p>
          <h1
            className="text-3xl sm:text-5xl font-bold leading-tight mb-6"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            Earn from your writing
          </h1>
          <p
            className="text-lg sm:text-xl leading-relaxed max-w-2xl mx-auto mb-8"
            style={{ color: "var(--muted)" }}
          >
            Create a monthly subscription plan. Publish entries for paid subscribers only.
            Build a sustainable income from the writing you love.
          </p>
          <Link
            href="/settings/billing"
            className="inline-flex rounded-full px-8 py-3 text-base font-medium transition-opacity hover:opacity-90"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            Get started
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section className="py-12 sm:py-16 px-4" style={{ background: "var(--surface)" }}>
        <div className="mx-auto max-w-4xl">
          <h2
            className="text-2xl sm:text-3xl font-bold text-center mb-12"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            How it works
          </h2>

          <div className="grid sm:grid-cols-3 gap-8">
            {[
              {
                step: "1",
                title: "Upgrade to Plus",
                desc: "Get Inkwell Plus ($5/mo) and connect your Stripe account. Setup takes about 5 minutes.",
              },
              {
                step: "2",
                title: "Create your plan",
                desc: "Set a name, description, and monthly price ($1\u2013$100). One plan, simple pricing.",
              },
              {
                step: "3",
                title: "Publish & earn",
                desc: "Write entries and set them as \u201CPaid subscribers only.\u201D Readers subscribe via Stripe Checkout.",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="rounded-xl border p-6 text-center"
                style={{ borderColor: "var(--border)", background: "var(--background)" }}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold mx-auto mb-4"
                  style={{ background: "var(--accent)", color: "#fff" }}
                >
                  {item.step}
                </div>
                <h3
                  className="text-base font-semibold mb-2"
                  style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
                >
                  {item.title}
                </h3>
                <p className="text-sm" style={{ color: "var(--muted)", lineHeight: 1.6 }}>
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Revenue breakdown */}
      <section className="py-12 sm:py-16 px-4">
        <div className="mx-auto max-w-3xl text-center">
          <h2
            className="text-2xl sm:text-3xl font-bold mb-4"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            You keep 92%
          </h2>
          <p className="text-base mb-8 max-w-xl mx-auto" style={{ color: "var(--muted)" }}>
            Inkwell takes an 8% platform fee to keep the service running. No hidden costs.
            Stripe handles payment processing (standard processing fees apply).
          </p>

          <div
            className="rounded-xl border p-6 sm:p-8 max-w-md mx-auto"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm" style={{ color: "var(--muted)" }}>Subscriber pays</span>
                <span className="font-bold">$10/mo</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm" style={{ color: "var(--muted)" }}>Inkwell fee (8%)</span>
                <span className="text-sm" style={{ color: "var(--muted)" }}>&minus;$0.80</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm" style={{ color: "var(--muted)" }}>Stripe processing</span>
                <span className="text-sm" style={{ color: "var(--muted)" }}>&minus;$0.59</span>
              </div>
              <div
                className="border-t pt-3 flex justify-between items-center"
                style={{ borderColor: "var(--border)" }}
              >
                <span className="font-semibold" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
                  You receive
                </span>
                <span className="text-xl font-bold" style={{ color: "var(--accent)" }}>
                  $8.61/mo
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Three features */}
      <section className="py-12 sm:py-16 px-4" style={{ background: "var(--surface)" }}>
        <div className="mx-auto max-w-4xl">
          <h2
            className="text-2xl sm:text-3xl font-bold text-center mb-12"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            Three ways to earn
          </h2>

          <div className="grid sm:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="text-3xl mb-3" aria-hidden="true">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto", color: "var(--accent)" }}>
                  <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </div>
              <h3
                className="text-base font-semibold mb-2"
                style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
              >
                Paid Subscriptions
              </h3>
              <p className="text-sm" style={{ color: "var(--muted)", lineHeight: 1.6 }}>
                Monthly recurring revenue from loyal readers. Publish exclusive content behind a paywall.
              </p>
            </div>

            <div className="text-center">
              <div className="text-3xl mb-3" aria-hidden="true">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto", color: "var(--accent)" }}>
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              </div>
              <h3
                className="text-base font-semibold mb-2"
                style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
              >
                Postage Tips
              </h3>
              <p className="text-sm" style={{ color: "var(--muted)", lineHeight: 1.6 }}>
                One-time payments from readers who appreciate your work. No minimum, no commitment.
              </p>
            </div>

            <div className="text-center">
              <div className="text-3xl mb-3" aria-hidden="true">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto", color: "var(--accent)" }}>
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
                </svg>
              </div>
              <h3
                className="text-base font-semibold mb-2"
                style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
              >
                Newsletter
              </h3>
              <p className="text-sm" style={{ color: "var(--muted)", lineHeight: 1.6 }}>
                Deliver your entries directly to subscribers&apos; inboxes. Build your audience on your terms.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section className="py-12 sm:py-16 px-4">
        <div className="mx-auto max-w-2xl">
          <h2
            className="text-2xl sm:text-3xl font-bold text-center mb-8"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            Why Inkwell?
          </h2>

          <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "var(--surface)" }}>
                  <th className="text-left p-3 font-medium" style={{ color: "var(--muted)" }}>&nbsp;</th>
                  <th className="p-3 font-semibold" style={{ color: "var(--accent)" }}>Inkwell</th>
                  <th className="p-3 font-medium" style={{ color: "var(--muted)" }}>Substack</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Platform fee", "8%", "10%"],
                  ["Own your audience", "\u2713 (ActivityPub)", "Partial"],
                  ["Custom profiles", "\u2713 (Full HTML/CSS)", "\u2717"],
                  ["Fediverse federation", "\u2713", "\u2717"],
                  ["One-time tips", "\u2713 (Postage)", "\u2717"],
                  ["Open source", "Coming soon", "\u2717"],
                  ["No algorithms", "\u2713", "\u2717"],
                ].map(([label, inkwell, substack], i) => (
                  <tr key={label} style={{ borderTop: "1px solid var(--border)", background: i % 2 === 0 ? "var(--background)" : "var(--surface)" }}>
                    <td className="p-3 font-medium">{label}</td>
                    <td className="p-3 text-center" style={{ color: inkwell === "\u2713" || inkwell?.includes("\u2713") ? "var(--success, #22c55e)" : undefined }}>
                      {inkwell}
                    </td>
                    <td className="p-3 text-center" style={{ color: substack === "\u2717" ? "var(--danger, #dc2626)" : "var(--muted)" }}>
                      {substack}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16 sm:py-20 px-4 text-center" style={{ background: "var(--surface)" }}>
        <div className="mx-auto max-w-2xl">
          <h2
            className="text-2xl sm:text-3xl font-bold mb-4"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            Start earning today
          </h2>
          <p className="text-base mb-8" style={{ color: "var(--muted)" }}>
            Upgrade to Plus, connect Stripe, create your plan. Your first paid entry could be live in 10 minutes.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/settings/billing"
              className="inline-flex justify-center rounded-full px-8 py-3 text-base font-medium transition-opacity hover:opacity-90"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              Get Plus &mdash; $5/mo
            </Link>
            <Link
              href="/get-started"
              className="inline-flex justify-center rounded-full px-8 py-3 text-base font-medium border transition-colors hover:opacity-80"
              style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
            >
              Create an account
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
