import type { Metadata } from "next";
import Link from "next/link";
import { FaqAccordion } from "./faq-accordion";

export const metadata: Metadata = {
  title: "Common Queries — Inkwell Help Center",
  description:
    "Frequently asked questions about Inkwell — accounts, writing, the fediverse, and more.",
  openGraph: {
    title: "Common Queries — Inkwell Help Center",
    description:
      "Frequently asked questions about Inkwell — accounts, writing, the fediverse, and more.",
    url: "https://inkwell.social/help/faq",
  },
  alternates: { canonical: "https://inkwell.social/help/faq" },
};

export default function FaqPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
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
        {" "}/ Common Queries
      </p>

      <p
        className="text-xs uppercase tracking-widest mb-1"
        style={{ color: "var(--accent)", fontFamily: "var(--font-lora, Georgia, serif)" }}
      >
        FAQ
      </p>
      <h1
        className="text-3xl font-bold mb-2"
        style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
      >
        Common Queries
      </h1>
      <p className="text-sm mb-8" style={{ color: "var(--muted)" }}>
        Answers to the questions we hear most often
      </p>

      <FaqAccordion searchParamsPromise={searchParams} />

      {/* Bottom links */}
      <div className="mt-12 pt-6 border-t" style={{ borderColor: "var(--border)" }}>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Can&rsquo;t find what you&rsquo;re looking for?{" "}
          <Link href="/help/contact" className="underline" style={{ color: "var(--accent)" }}>
            Contact us
          </Link>{" "}
          or check the{" "}
          <Link href="/guide" className="underline" style={{ color: "var(--accent)" }}>
            Reader&rsquo;s Guide
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
