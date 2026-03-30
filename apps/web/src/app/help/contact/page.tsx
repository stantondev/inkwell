import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = {
  title: "The Correspondence Office — Inkwell Help Center",
  description:
    "Send us a private message. We read every letter and respond as quickly as we can.",
  openGraph: {
    title: "The Correspondence Office — Inkwell Help Center",
    description:
      "Send us a private message. We read every letter and respond as quickly as we can.",
    url: "https://inkwell.social/help/contact",
  },
  alternates: { canonical: "https://inkwell.social/help/contact" },
};

export default async function ContactPage() {
  const session = await getSession();

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
        {" "}/ Contact
      </p>

      <p
        className="text-xs uppercase tracking-widest mb-1"
        style={{ color: "var(--accent)", fontFamily: "var(--font-lora, Georgia, serif)" }}
      >
        Support
      </p>
      <h1
        className="text-3xl font-bold mb-2"
        style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
      >
        The Correspondence Office
      </h1>
      <p className="text-sm mb-8" style={{ color: "var(--muted)" }}>
        Send us a private message — we read every letter and respond as quickly as we can
      </p>

      <ContactForm username={session?.user?.username} />

      {/* Bottom links */}
      <div className="mt-12 pt-6 border-t" style={{ borderColor: "var(--border)" }}>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          For feature requests and bug reports, use the{" "}
          <Link href="/roadmap/new" className="underline" style={{ color: "var(--accent)" }}>
            public feedback board
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
