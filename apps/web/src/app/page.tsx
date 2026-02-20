import Link from "next/link";

// ---------------------------------------------------------------------------
// Feature list
// ---------------------------------------------------------------------------
const FEATURES = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
      </svg>
    ),
    title: "Rich journaling",
    body: "A beautiful Tiptap-powered editor with headings, blockquotes, embeds, and mood / music metadata on every entry.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
      </svg>
    ),
    title: "Chronological feed",
    body: "No algorithm. No ranking. Just your friends' entries in the order they were written — with an actual end to scroll to.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
    ),
    title: "Granular privacy",
    body: "Public, friends-only, private, or custom friend filters — per entry. You decide who reads every word.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
    title: "Real comments",
    body: "Threaded comments with full formatting. Talk to your friends like it's 2004, in the best possible way.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
      </svg>
    ),
    title: "ActivityPub federation",
    body: "Inkwell speaks the open social web. Follow people on Mastodon, Ghost, and beyond. Your data is always yours.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
      </svg>
    ),
    title: "Profile customization",
    body: "CSS and HTML profile theming in a sandboxed Shadow DOM — the creative freedom of MySpace without the XSS.",
  },
];

// ---------------------------------------------------------------------------
// Sample entry previews (shown on landing to give the vibe)
// ---------------------------------------------------------------------------
const SAMPLE_ENTRIES = [
  {
    author: "margot_writes",
    displayName: "Margot Chen",
    mood: "reflective 🌧",
    music: "Sufjan Stevens — Death With Dignity",
    title: "Three years in Portland",
    excerpt:
      "I keep coming back to the way the light looks in November here. Not the grey that people warn you about — a specific silver that settles on the Willamette around 4pm when you've run out of reasons to stay inside…",
    time: "2h ago",
  },
  {
    author: "raf_diaries",
    displayName: "Rafael Osei",
    mood: "caffeinated ☕",
    music: null,
    title: null,
    excerpt:
      "finished the book. wept. made coffee. started the book again. this is fine.",
    time: "5h ago",
  },
  {
    author: "velvet_underscore",
    displayName: "Vera L.",
    mood: "nostalgic 📼",
    music: "The Mountain Goats — No Children",
    title: "On keeping an online journal in 2026",
    excerpt:
      "I had a LiveJournal from 2003 to 2009. I deleted it in a moment of embarrassment and have regretted it ever since. Inkwell feels like finally getting the chance to say sorry to my teenage self…",
    time: "yesterday",
  },
];

// ---------------------------------------------------------------------------
// Mood/music line component used in sample entries
// ---------------------------------------------------------------------------
function EntryMeta({ mood, music }: { mood: string | null; music: string | null }) {
  if (!mood && !music) return null;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mb-3" style={{ color: "var(--muted)" }}>
      {mood && (
        <span>
          <span className="font-medium" style={{ color: "var(--foreground)" }}>mood:</span>{" "}
          {mood}
        </span>
      )}
      {music && (
        <span>
          <span className="font-medium" style={{ color: "var(--foreground)" }}>listening to:</span>{" "}
          {music}
        </span>
      )}
    </div>
  );
}

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
          <span style={{ color: "var(--accent)" }}>Your friends.</span>
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
            href="/login"
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

      {/* ── Sample entries ────────────────────────────────────────────── */}
      <section
        className="border-y py-12"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div className="mx-auto max-w-5xl px-4">
          <p
            className="text-xs font-medium uppercase tracking-widest mb-8 text-center"
            style={{ color: "var(--muted)" }}
          >
            Recent public entries
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            {SAMPLE_ENTRIES.map((entry) => (
              <article
                key={entry.author}
                className="rounded-xl border p-5 flex flex-col gap-3 transition-shadow hover:shadow-md"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--background)",
                }}
              >
                {/* Author row */}
                <div className="flex items-center gap-2">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold"
                    style={{
                      background: "var(--accent-light)",
                      color: "var(--accent)",
                    }}
                    aria-hidden="true"
                  >
                    {entry.displayName[0]}
                  </div>
                  <div className="flex flex-col leading-none">
                    <span className="text-sm font-medium">{entry.displayName}</span>
                    <span className="text-xs" style={{ color: "var(--muted)" }}>
                      @{entry.author} · {entry.time}
                    </span>
                  </div>
                </div>

                {/* Meta */}
                <EntryMeta mood={entry.mood} music={entry.music} />

                {/* Content */}
                {entry.title && (
                  <h3 className="font-semibold leading-snug" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
                    {entry.title}
                  </h3>
                )}
                <p
                  className="text-sm leading-relaxed line-clamp-4"
                  style={{
                    fontFamily: "var(--font-lora, Georgia, serif)",
                    color: "var(--muted)",
                  }}
                >
                  {entry.excerpt}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-4 py-20">
        <h2
          className="text-3xl font-semibold text-center mb-12"
          style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
        >
          Everything a journal should be
        </h2>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="flex flex-col gap-3">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{
                  background: "var(--accent-light)",
                  color: "var(--accent)",
                }}
              >
                {f.icon}
              </div>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing callout ───────────────────────────────────────────── */}
      <section
        className="border-t py-16"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2
            className="text-3xl font-semibold mb-4"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            Free to start. Plus for the power users.
          </h2>
          <p className="text-base leading-relaxed mb-10" style={{ color: "var(--muted)" }}>
            Inkwell is free for everyone with a generous feature set. Inkwell Plus ($5/mo) unlocks
            extended storage, custom domains, advanced profile theming, and the ability to
            accept tips from readers.
          </p>
          <div className="flex flex-col sm:flex-row gap-6 justify-center items-stretch sm:items-start">
            {/* Free tier */}
            <div
              className="flex-1 max-w-xs rounded-2xl border p-6 text-left"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            >
              <p className="text-sm font-medium mb-1" style={{ color: "var(--muted)" }}>Free</p>
              <p className="text-3xl font-bold mb-4">$0</p>
              <ul className="space-y-2 text-sm" style={{ color: "var(--muted)" }}>
                {["Unlimited public entries", "Per-entry privacy controls", "Friend filters", "Top 8 friends", "RSS feed", "ActivityPub federation"].map((item) => (
                  <li key={item} className="flex gap-2 items-start">
                    <span style={{ color: "var(--success)" }} aria-hidden="true">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            {/* Plus tier */}
            <div
              className="flex-1 max-w-xs rounded-2xl border-2 p-6 text-left"
              style={{ borderColor: "var(--accent)", background: "var(--surface)" }}
            >
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
                  "Accept reader tips",
                  "Priority support",
                ].map((item) => (
                  <li key={item} className="flex gap-2 items-start">
                    <span style={{ color: "var(--accent)" }} aria-hidden="true">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                href="/login"
                className="mt-6 block text-center rounded-full py-2 text-sm font-medium transition-opacity hover:opacity-80"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                Get started free
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer
        className="border-t py-8"
        style={{ borderColor: "var(--border)" }}
      >
        <div
          className="mx-auto max-w-5xl px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm"
          style={{ color: "var(--muted)" }}
        >
          <span style={{ fontFamily: "var(--font-lora, Georgia, serif)", fontWeight: 600 }}>
            inkwell
          </span>
          <div className="flex gap-5">
            <Link href="/about" className="hover:underline">About</Link>
            <Link href="/privacy" className="hover:underline">Privacy</Link>
            <Link href="/terms" className="hover:underline">Terms</Link>
            <a href="https://github.com/inkwellsocial/inkwell" className="hover:underline" target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
          </div>
          <span>© 2026 Inkwell · no ads, ever</span>
        </div>
      </footer>
    </div>
  );
}
