import type { Metadata } from "next";
import Link from "next/link";
import { HELP_CATEGORIES } from "@/lib/help-content";
import { HelpSearch } from "./help-search";

export const metadata: Metadata = {
  title: "The Reference Desk — Inkwell Help Center",
  description:
    "Find answers, guides, and support for everything on Inkwell.",
  openGraph: {
    title: "The Reference Desk — Inkwell Help Center",
    description:
      "Find answers, guides, and support for everything on Inkwell.",
    url: "https://inkwell.social/help",
  },
  alternates: { canonical: "https://inkwell.social/help" },
};

/* ── quick link cards ──────────────────────────────────────────────── */

const QUICK_LINKS = [
  {
    href: "/help/getting-started",
    label: "Getting Started",
    description: "New to Inkwell? Start here.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5v14M5 12h14" />
      </svg>
    ),
  },
  {
    href: "/help/faq",
    label: "FAQ",
    description: "Answers to common questions.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  {
    href: "/help/contact",
    label: "Contact Support",
    description: "Send us a private message.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
      </svg>
    ),
  },
  {
    href: "/help/status",
    label: "System Status",
    description: "Check if everything is running.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    ),
  },
];

/* ── page ─────────────────────────────────────────────────────────── */

export default function HelpPage() {
  return (
    <main
      className="mx-auto max-w-3xl px-4 py-12"
      style={{ color: "var(--foreground)" }}
    >
      {/* Hero */}
      <p
        className="text-xs uppercase tracking-widest mb-1"
        style={{ color: "var(--accent)", fontFamily: "var(--font-lora, Georgia, serif)" }}
      >
        Help Center
      </p>
      <h1
        className="text-3xl font-bold mb-2"
        style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
      >
        The Reference Desk
      </h1>
      <p className="text-sm mb-8" style={{ color: "var(--muted)" }}>
        Everything you need to know about Inkwell
      </p>

      {/* Search (client island) */}
      <HelpSearch />

      {/* Quick links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
        {QUICK_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="help-quick-link rounded-xl border p-4 text-center transition-colors"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            <span className="inline-flex mb-2" style={{ color: "var(--accent)" }}>
              {link.icon}
            </span>
            <span
              className="block text-sm font-semibold mb-1"
              style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
            >
              {link.label}
            </span>
            <span className="block text-xs" style={{ color: "var(--muted)" }}>
              {link.description}
            </span>
          </Link>
        ))}
      </div>

      {/* Topic categories */}
      <h2
        className="text-lg font-bold mb-4"
        style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
      >
        Browse by Topic
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
        {HELP_CATEGORIES.map((cat) => {
          const href =
            cat.id === "technical"
              ? "/developers"
              : cat.id === "getting-started"
                ? "/help/getting-started"
                : `/help/faq?category=${cat.id}`;

          return (
            <Link
              key={cat.id}
              href={href}
              className="help-category-card rounded-xl border p-5 transition-colors"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            >
              <p
                className="text-xs uppercase tracking-widest mb-1"
                style={{ color: "var(--accent)", fontFamily: "var(--font-lora, Georgia, serif)" }}
              >
                {cat.number}
              </p>
              <h3
                className="text-sm font-bold mb-1"
                style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
              >
                {cat.label}
              </h3>
              <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
                {cat.description}
              </p>
            </Link>
          );
        })}
      </div>

      {/* Bottom links */}
      <div className="pt-6 border-t" style={{ borderColor: "var(--border)" }}>
        <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>
          More about Inkwell
        </p>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Link href="/guide" className="hover:underline" style={{ color: "var(--accent)" }}>
            Reader&rsquo;s Guide
          </Link>
          <Link href="/guidelines" className="hover:underline" style={{ color: "var(--accent)" }}>
            Community Guidelines
          </Link>
          <Link href="/about" className="hover:underline" style={{ color: "var(--accent)" }}>
            About Inkwell
          </Link>
          <Link href="/developers" className="hover:underline" style={{ color: "var(--accent)" }}>
            API Documentation
          </Link>
          <Link href="/roadmap" className="hover:underline" style={{ color: "var(--accent)" }}>
            Roadmap
          </Link>
          <Link href="/terms" className="hover:underline" style={{ color: "var(--accent)" }}>
            Terms
          </Link>
          <Link href="/privacy" className="hover:underline" style={{ color: "var(--accent)" }}>
            Privacy
          </Link>
        </div>
      </div>
    </main>
  );
}
