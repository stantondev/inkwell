import Link from "next/link";
import { PROFILE_THEMES } from "@/lib/profile-themes";

// Stamp icons to show in the showcase
const SHOWCASE_STAMPS = [
  { key: "felt", src: "/stamps/felt.svg", label: "Felt" },
  { key: "holding_space", src: "/stamps/holding-space.svg", label: "Holding Space" },
  { key: "beautifully_said", src: "/stamps/beautifully-said.svg", label: "Beautifully Said" },
  { key: "rooting", src: "/stamps/rooting.svg", label: "Rooting For You" },
  { key: "i_cannot", src: "/stamps/i-cannot.svg", label: "I Cannot" },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function LandingPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-4 pt-20 pb-16 text-center">
        <div
          className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium mb-8 border"
          style={{
            borderColor: "var(--accent)",
            color: "var(--accent)",
            background: "var(--accent-light)",
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--accent)" }} aria-hidden="true" />
          Open beta · federated · no ads, ever
        </div>

        <h1
          className="text-5xl sm:text-6xl font-semibold leading-tight tracking-tight mb-6"
          style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
        >
          Your journal.
          <br />
          <span style={{ color: "var(--accent)" }}>Your pen pals.</span>
          <br />
          Your space.
        </h1>

        <p
          className="max-w-xl mx-auto text-lg leading-relaxed mb-10"
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
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2
            className="text-3xl font-semibold mb-4"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            Free during beta. Support us early.
          </h2>
          <p className="text-base leading-relaxed mb-10" style={{ color: "var(--muted)" }}>
            Inkwell is completely free while we&apos;re in beta. We&apos;re building something
            different — no ads, no algorithms, no big tech. That means we need our community
            to help sustain this. Inkwell Plus ($5/mo) is available now for those who want to
            support the platform and unlock extra features.
          </p>
          <div className="flex flex-col sm:flex-row gap-6 justify-center items-stretch sm:items-start">
            {/* Free tier */}
            <div
              className="flex-1 max-w-xs rounded-2xl border p-6 text-left"
              style={{ borderColor: "var(--border)", background: "var(--background)" }}
            >
              <p className="text-sm font-medium mb-1" style={{ color: "var(--muted)" }}>Free</p>
              <p className="text-3xl font-bold mb-4">$0</p>
              <ul className="space-y-2 text-sm" style={{ color: "var(--muted)" }}>
                {["Unlimited public entries", "Per-entry privacy controls", "Pen Pal filters", "Top 6 pen pals", "RSS feed", "ActivityPub federation"].map((item) => (
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
                Join the beta
              </Link>
            </div>
            {/* Plus tier */}
            <div
              className="flex-1 max-w-xs rounded-2xl border-2 p-6 text-left relative overflow-hidden"
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
                  "Custom domain",
                  "Extended media storage",
                  "Advanced profile CSS/HTML",
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

      {/* ── Product Showcase ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-4 py-20">
        <p
          className="text-xs font-medium uppercase tracking-widest mb-8 text-center"
          style={{ color: "var(--muted)" }}
        >
          What writing on Inkwell looks like
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          {/* Card 1: Journal page-turning UI */}
          <div
            className="rounded-xl border p-5 flex flex-col gap-4"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            {/* Book spread illustration */}
            <div
              className="rounded-lg p-4 flex items-center justify-center"
              style={{ background: "var(--accent-light)", minHeight: 140 }}
            >
              <div className="flex gap-0.5 w-full max-w-[200px]">
                {/* Left page */}
                <div
                  className="flex-1 rounded-l-md p-3 flex flex-col gap-2"
                  style={{ background: "var(--background)", border: "1px solid var(--border)" }}
                >
                  <div className="h-2 rounded-full w-3/4" style={{ background: "var(--accent)", opacity: 0.6 }} />
                  <div className="h-1.5 rounded-full w-full" style={{ background: "var(--border)" }} />
                  <div className="h-1.5 rounded-full w-full" style={{ background: "var(--border)" }} />
                  <div className="h-1.5 rounded-full w-5/6" style={{ background: "var(--border)" }} />
                  <div className="h-1.5 rounded-full w-full" style={{ background: "var(--border)" }} />
                  <div className="h-1.5 rounded-full w-2/3" style={{ background: "var(--border)" }} />
                </div>
                {/* Spine */}
                <div className="w-px" style={{ background: "var(--border)" }} />
                {/* Right page */}
                <div
                  className="flex-1 rounded-r-md p-3 flex flex-col gap-2"
                  style={{ background: "var(--background)", border: "1px solid var(--border)" }}
                >
                  <div className="h-2 rounded-full w-2/3" style={{ background: "var(--accent)", opacity: 0.6 }} />
                  <div className="h-1.5 rounded-full w-full" style={{ background: "var(--border)" }} />
                  <div className="h-1.5 rounded-full w-full" style={{ background: "var(--border)" }} />
                  <div className="h-1.5 rounded-full w-4/5" style={{ background: "var(--border)" }} />
                  <div className="h-1.5 rounded-full w-full" style={{ background: "var(--border)" }} />
                  <div className="h-1.5 rounded-full w-3/4" style={{ background: "var(--border)" }} />
                </div>
              </div>
            </div>
            <div>
              <h3 className="font-semibold mb-1" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
                Read like a journal
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                Entries open in a book spread with page-turning navigation. No infinite scroll — just your pen pals&apos; words, one page at a time.
              </p>
            </div>
          </div>

          {/* Card 2: Profile themes */}
          <div
            className="rounded-xl border p-5 flex flex-col gap-4"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            {/* Theme swatches */}
            <div
              className="rounded-lg p-4 flex items-center justify-center"
              style={{ background: "var(--accent-light)", minHeight: 140 }}
            >
              <div className="grid grid-cols-4 gap-2.5">
                {PROFILE_THEMES.map((theme, i) => (
                  <div
                    key={theme.id}
                    className="w-9 h-9 rounded-full shadow-sm transition-transform hover:scale-110"
                    style={{
                      background: theme.preview,
                      boxShadow: i === 2
                        ? "0 0 0 2px var(--accent), 0 1px 3px rgba(0,0,0,0.1)"
                        : "0 1px 3px rgba(0,0,0,0.1)",
                    }}
                    title={theme.name}
                  />
                ))}
              </div>
            </div>
            <div>
              <h3 className="font-semibold mb-1" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
                Make it yours
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                Eight themes, custom colors, fonts, background images, music players, and full CSS/HTML for Plus members. Your profile, your rules.
              </p>
            </div>
          </div>

          {/* Card 3: Stamps */}
          <div
            className="rounded-xl border p-5 flex flex-col gap-4"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            {/* Stamp icons */}
            <div
              className="rounded-lg p-4 flex items-center justify-center"
              style={{ background: "var(--accent-light)", minHeight: 140 }}
            >
              <div className="flex items-center gap-3">
                {SHOWCASE_STAMPS.map((stamp) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={stamp.key}
                    src={stamp.src}
                    alt={stamp.label}
                    width={36}
                    height={36}
                    className="stamp-impression transition-transform hover:scale-110 hover:-rotate-3"
                    style={{ opacity: 0.85 }}
                  />
                ))}
              </div>
            </div>
            <div>
              <h3 className="font-semibold mb-1" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
                Stamps, not likes
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                No counts, no dopamine metrics. Press a meaningful reaction onto someone&apos;s entry like an ink stamp on paper.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Built in the Open ────────────────────────────────────────── */}
      <section
        className="border-t py-16"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div className="mx-auto max-w-4xl px-4">
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
