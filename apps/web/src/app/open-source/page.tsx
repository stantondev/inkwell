import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Open Source — Inkwell",
  description:
    "Inkwell is open-source software licensed under AGPL-3.0. View the source code, self-host your own instance, and contribute to the project.",
  openGraph: {
    title: "Open Source — Inkwell",
    description:
      "Inkwell is open-source software. View the code, self-host it, contribute.",
    url: "https://inkwell.social/open-source",
  },
  alternates: { canonical: "https://inkwell.social/open-source" },
};

const REPO_URL = "https://github.com/stantondev/inkwell";

export default function OpenSourcePage() {
  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-4 pt-20 pb-16">
        <p
          className="text-xs font-medium uppercase tracking-widest mb-6"
          style={{ color: "var(--accent)" }}
        >
          Open Source
        </p>
        <h1
          className="text-2xl sm:text-4xl lg:text-5xl font-bold leading-tight mb-8"
          style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
        >
          Inkwell is Open Source
        </h1>
        <p className="text-base sm:text-lg leading-relaxed mb-6" style={{ color: "var(--muted)" }}>
          Every line of code that powers Inkwell is publicly available.
          You can read it, run it, modify it, and host your own instance.
          We believe the platforms people write on should be transparent and accountable.
        </p>
        <div className="flex flex-wrap gap-2">
          {["AGPL-3.0", "ActivityPub", "Self-Hostable"].map((label) => (
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
      </section>

      {/* ── Source Code ────────────────────────────────────────────────── */}
      <section
        className="border-y py-16"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div className="mx-auto max-w-3xl px-4">
          <h2
            className="text-2xl sm:text-3xl font-semibold mb-6"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            Source Code
          </h2>
          <p className="text-base leading-relaxed mb-6">
            The complete Inkwell codebase is hosted on GitHub. The backend is built with
            Elixir and Phoenix, the frontend with Next.js and React, and federation
            is handled natively via ActivityPub — no sidecar services required.
          </p>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-80"
            style={{ background: "var(--accent)", color: "white" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
            </svg>
            View on GitHub
          </a>
        </div>
      </section>

      {/* ── License ───────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-4 py-16">
        <h2
          className="text-2xl sm:text-3xl font-semibold mb-6"
          style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
        >
          License
        </h2>
        <p className="text-base leading-relaxed mb-4">
          Inkwell is licensed under the{" "}
          <a
            href={`${REPO_URL}/blob/main/LICENSE`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
            style={{ color: "var(--accent)" }}
          >
            GNU Affero General Public License v3.0
          </a>{" "}
          (AGPL-3.0).
        </p>
        <p className="text-base leading-relaxed mb-4" style={{ color: "var(--muted)" }}>
          In plain language, this means:
        </p>
        <ul className="flex flex-col gap-3 mb-4">
          {[
            "You can view, copy, and modify the source code freely.",
            "You can run your own instance of Inkwell for any purpose.",
            "If you modify and distribute Inkwell (or run a modified version as a public service), you must share your changes under the same license.",
            "The AGPL ensures Inkwell remains open — no one can take the code proprietary.",
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-3">
              <span
                className="flex-shrink-0 mt-1 text-sm"
                style={{ color: "var(--accent)" }}
                aria-hidden="true"
              >
                &#10003;
              </span>
              <span className="text-base leading-relaxed">{item}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Self-Hosting ──────────────────────────────────────────────── */}
      <section
        className="border-y py-16"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div className="mx-auto max-w-3xl px-4">
          <h2
            className="text-2xl sm:text-3xl font-semibold mb-6"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            Self-Hosting
          </h2>
          <p className="text-base leading-relaxed mb-4">
            Inkwell is designed to run on your own server. The self-hosted mode
            unlocks all Plus features for every user on your instance — no
            subscription required. All you need is a server with Docker.
          </p>
          <p className="text-base leading-relaxed mb-6">
            Pre-built Docker images are published to GitHub Container Registry on every
            release, so you can be up and running in minutes.
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              href={`${REPO_URL}/blob/main/SELF_HOSTING.md`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium border transition-opacity hover:opacity-80"
              style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
            >
              Self-Hosting Guide
            </a>
            <a
              href="https://github.com/stantondev/inkwell/pkgs/container/inkwell-api"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium border transition-opacity hover:opacity-80"
              style={{ borderColor: "var(--border)", color: "var(--muted)" }}
            >
              Docker Images
            </a>
          </div>
        </div>
      </section>

      {/* ── Contributing & Issues ─────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-4 py-16">
        <h2
          className="text-2xl sm:text-3xl font-semibold mb-6"
          style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
        >
          Contributing &amp; Issues
        </h2>
        <p className="text-base leading-relaxed mb-4">
          Found a bug? Have an idea? There are two ways to get involved:
        </p>
        <div className="grid gap-4 sm:grid-cols-2 mb-6">
          <a
            href={`${REPO_URL}/issues`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border p-5 flex flex-col gap-2 transition-colors hover:opacity-80"
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
              GitHub Issues
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
              Report bugs, request features, or browse existing discussions on GitHub.
            </p>
          </a>
          <Link
            href="/roadmap"
            className="rounded-xl border p-5 flex flex-col gap-2 transition-colors hover:opacity-80"
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
              Community Roadmap
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
              Submit ideas, vote on features, and track what the team is building next.
            </p>
          </Link>
        </div>
        <p className="text-base leading-relaxed" style={{ color: "var(--muted)" }}>
          Pull requests are welcome. If you&apos;re planning a larger change,
          open an issue first so we can discuss the approach.
        </p>
      </section>

      {/* ── Follow Development ────────────────────────────────────────── */}
      <section
        className="border-y py-16"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div className="mx-auto max-w-3xl px-4">
          <h2
            className="text-2xl sm:text-3xl font-semibold mb-6"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            Follow Development
          </h2>
          <p className="text-base leading-relaxed mb-6">
            Inkwell is actively developed in the open. Here&apos;s how to stay in the loop:
          </p>
          <ul className="flex flex-col gap-3">
            {[
              {
                label: "Star & watch the repo",
                desc: "Get notified of new releases and activity.",
                href: REPO_URL,
                external: true,
              },
              {
                label: "Community roadmap",
                desc: "See what's planned and what just shipped.",
                href: "/roadmap",
                external: false,
              },
              {
                label: "Release notes",
                desc: "Read the Inkwell Gazette for detailed changelogs.",
                href: "/roadmap/releases",
                external: false,
              },
            ].map((item) => (
              <li key={item.label} className="flex items-start gap-3">
                <span
                  className="flex-shrink-0 mt-1 text-sm"
                  style={{ color: "var(--accent)" }}
                  aria-hidden="true"
                >
                  &rarr;
                </span>
                <span className="text-base leading-relaxed">
                  {item.external ? (
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2"
                      style={{ color: "var(--accent)" }}
                    >
                      {item.label}
                    </a>
                  ) : (
                    <Link
                      href={item.href}
                      className="underline underline-offset-2"
                      style={{ color: "var(--accent)" }}
                    >
                      {item.label}
                    </Link>
                  )}{" "}
                  — <span style={{ color: "var(--muted)" }}>{item.desc}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Closing ───────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-4 py-16">
        <blockquote
          className="border-l-4 pl-6 py-3"
          style={{
            borderColor: "var(--accent)",
            fontFamily: "var(--font-lora, Georgia, serif)",
          }}
        >
          <p
            className="text-lg sm:text-xl leading-relaxed italic"
            style={{ color: "var(--muted)" }}
          >
            We build Inkwell in the open because the platforms people write on
            should be transparent. Open source isn&apos;t a feature — it&apos;s a commitment.
          </p>
        </blockquote>
      </section>
    </div>
  );
}
