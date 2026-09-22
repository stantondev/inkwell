import type { Metadata } from "next";
import Link from "next/link";
import { HELP_EMAIL } from "@/app/switch/switch-shared";

export const metadata: Metadata = {
  title: "For Writers — Bring Your Writing to Inkwell",
  description:
    "Move your archive in, keep your dates, put it on your own domain, and reach readers on Mastodon, Bluesky, email and RSS. No algorithm, no ads, export any time.",
  openGraph: {
    title: "For Writers — Bring Your Writing to Inkwell",
    description:
      "Move your archive in, put it on your own domain, and reach readers on Mastodon, Bluesky, email and RSS.",
    url: "https://inkwell.social/for-writers",
    type: "website",
  },
  twitter: {
    card: "summary",
    site: "@inkwellsocial",
    title: "For Writers — Bring Your Writing to Inkwell",
    description: "Your archive, your domain, your readers — on the open web.",
  },
  alternates: { canonical: "https://inkwell.social/for-writers" },
};

const serif = { fontFamily: "var(--font-lora, Georgia, serif)" };

const PILLARS: { title: string; body: string }[] = [
  {
    title: "Bring your archive",
    body: "Import from WordPress, Substack, Medium, CSV or JSON. Original dates are kept and images are copied over, so your back catalogue arrives intact.",
  },
  {
    title: "Reach readers wherever they are",
    body: "People on Mastodon and Bluesky can follow your journal without an account. Readers can also subscribe by email or RSS.",
  },
  {
    title: "Put it on your own name",
    body: "With Plus, your journal lives at yourname.com. If you ever leave, you take the domain, the words and the subscriber list with you.",
  },
];

// Kept deliberately honest: where Substack is ahead, it says so.
const COMPARISON: [string, string, string][] = [
  ["Price for writers", "Free, or $5/mo for Plus", "Free (10% of paid subscriptions)"],
  ["Paid subscriptions", "Not yet — support links instead", "Yes"],
  ["Email newsletter", "Yes (500 subscribers free, unlimited on Plus)", "Yes"],
  ["Followable from Mastodon & Bluesky", "Yes", "No"],
  ["Custom domain", "Plus", "$50 one-time"],
  ["Full HTML & CSS for your page", "Plus", "No"],
  ["Recommendation algorithm", "None", "Yes"],
  ["Open source", "Yes (AGPL-3.0)", "No"],
];

export default function ForWritersPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      {/* Hero */}
      <section className="py-16 sm:py-24 px-4 text-center">
        <div className="mx-auto max-w-3xl">
          <p
            className="text-sm font-medium uppercase mb-4"
            style={{ color: "var(--accent)", letterSpacing: "0.15em" }}
          >
            For Writers
          </p>
          <h1 className="text-3xl sm:text-5xl font-bold leading-tight mb-6" style={serif}>
            Your writing, on your terms
          </h1>
          <p className="text-lg sm:text-xl leading-relaxed max-w-2xl mx-auto mb-8" style={{ color: "var(--muted)" }}>
            Bring your archive, keep your dates, and publish to readers on Inkwell,
            Mastodon, Bluesky, email and RSS at once. No algorithm deciding who sees
            it, and no ads next to it.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/switch"
              className="inline-flex justify-center rounded-full px-7 py-3 text-base font-medium transition-opacity hover:opacity-90"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              Move your writing here
            </Link>
            <Link
              href="/get-started"
              className="inline-flex justify-center rounded-full px-7 py-3 text-base font-medium border transition-opacity hover:opacity-80"
              style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
            >
              Start fresh
            </Link>
          </div>
        </div>
      </section>

      {/* Pillars */}
      <section className="py-12 sm:py-16 px-4" style={{ background: "var(--surface)" }}>
        <div className="mx-auto max-w-5xl grid gap-8 sm:grid-cols-3">
          {PILLARS.map((p, i) => (
            <div key={p.title}>
              <p className="text-sm italic mb-2" style={{ ...serif, color: "var(--accent)" }}>
                {["I", "II", "III"][i]}.
              </p>
              <h2 className="text-lg font-semibold mb-2" style={serif}>{p.title}</h2>
              <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Getting paid */}
      <section className="py-12 sm:py-16 px-4">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4" style={serif}>
            Getting paid for your writing
          </h2>
          <div className="space-y-4 text-base leading-relaxed" style={{ color: "var(--muted)" }}>
            <p>
              Inkwell doesn&apos;t run paid subscriptions right now. Splitting payments
              between readers and writers needs a kind of payment account we don&apos;t
              have yet, and we&apos;d rather tell you that than promise it.
            </p>
            <p>
              What works today: add your Ko-fi, Patreon, Buy Me a Coffee or any payment
              page, and a support button appears on your profile and under every entry.
              Inkwell takes nothing from it. Your email newsletter keeps your readers
              reachable whatever you decide later.
            </p>
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section className="py-12 sm:py-16 px-4" style={{ background: "var(--surface)" }}>
        <div className="mx-auto max-w-3xl">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-8" style={serif}>
            Inkwell and Substack, side by side
          </h2>
          <div className="rounded-xl border overflow-x-auto" style={{ borderColor: "var(--border)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "var(--background)" }}>
                  <th className="text-left p-3 font-medium" style={{ color: "var(--muted)" }}>&nbsp;</th>
                  <th className="text-left p-3 font-semibold" style={{ color: "var(--accent)" }}>Inkwell</th>
                  <th className="text-left p-3 font-medium" style={{ color: "var(--muted)" }}>Substack</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map(([label, inkwell, substack], i) => (
                  <tr
                    key={label}
                    style={{
                      borderTop: "1px solid var(--border)",
                      background: i % 2 === 0 ? "var(--surface)" : "var(--background)",
                    }}
                  >
                    <td className="p-3 font-medium">{label}</td>
                    <td className="p-3">{inkwell}</td>
                    <td className="p-3" style={{ color: "var(--muted)" }}>{substack}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs mt-3 text-center" style={{ color: "var(--muted)" }}>
            Substack details as published on substack.com, September 2026.
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16 sm:py-20 px-4 text-center">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4" style={serif}>
            We&apos;ll help you move
          </h2>
          <p className="text-base mb-8" style={{ color: "var(--muted)" }}>
            Coming from LiveJournal, Dreamwidth, Tumblr, Blogger or somewhere else we
            don&apos;t import yet? Email{" "}
            <a href={`mailto:${HELP_EMAIL}`} className="underline" style={{ color: "var(--accent)" }}>
              {HELP_EMAIL}
            </a>{" "}
            and tell us where your archive lives. A real person will help you bring it over.
          </p>
          <Link
            href="/switch"
            className="inline-flex justify-center rounded-full px-8 py-3 text-base font-medium transition-opacity hover:opacity-90"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            See how moving works
          </Link>
        </div>
      </section>
    </div>
  );
}
