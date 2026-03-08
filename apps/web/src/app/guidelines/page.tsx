import type { Metadata } from "next";
import Link from "next/link";
import { GUIDELINES_PAGES } from "@/lib/community-guidelines";

export const metadata: Metadata = {
  title: "Community Guidelines",
  description: "Inkwell Community Guidelines — the standards that keep our community safe and welcoming.",
  openGraph: {
    title: "Community Guidelines — Inkwell",
    description: "The standards that keep the Inkwell community safe and welcoming.",
    url: "https://inkwell.social/guidelines",
  },
  alternates: { canonical: "https://inkwell.social/guidelines" },
};

export default function GuidelinesPage() {
  return (
    <main
      className="mx-auto max-w-3xl px-4 py-12"
      style={{ color: "var(--foreground)" }}
    >
      <h1
        className="text-3xl font-bold mb-2"
        style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
      >
        Community Guidelines
      </h1>
      <p className="text-sm mb-10" style={{ color: "var(--muted)" }}>
        Last Updated: March 9, 2026
      </p>

      <div className="prose-legal flex flex-col gap-8 text-base leading-relaxed">
        <p>
          Inkwell is a space for authentic human expression. These guidelines exist to keep it that way &mdash;
          a place where every writer feels safe to be honest, vulnerable, and creative. They complement
          our <Link href="/terms" className="underline" style={{ color: "var(--accent)" }}>Terms of Service</Link> and
          {" "}<Link href="/privacy" className="underline" style={{ color: "var(--accent)" }}>Privacy Policy</Link>.
        </p>

        {GUIDELINES_PAGES.map((page, index) => (
          <section key={page.id}>
            <h2
              className="text-xl font-semibold mb-3"
              style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
            >
              {index + 1}. {page.title}
            </h2>
            {page.body.map((paragraph, i) => (
              <p key={i} className={i > 0 ? "mt-3" : ""}>
                {paragraph}
              </p>
            ))}
          </section>
        ))}

        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            Questions?
          </h2>
          <p>
            If you have questions about these guidelines or need to report a concern,
            reach out to us at{" "}
            <a href="mailto:hello@inkwell.social" className="underline" style={{ color: "var(--accent)" }}>
              hello@inkwell.social
            </a>{" "}
            or through the{" "}
            <Link href="/roadmap" className="underline" style={{ color: "var(--accent)" }}>
              community roadmap
            </Link>.
          </p>
        </section>
      </div>
    </main>
  );
}
