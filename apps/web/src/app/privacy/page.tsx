import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Inkwell Privacy Policy — how we collect, use, and protect your data.",
};

export default function PrivacyPage() {
  return (
    <main
      className="mx-auto max-w-3xl px-4 py-12"
      style={{ color: "var(--foreground)" }}
    >
      <h1
        className="text-3xl font-bold mb-2"
        style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
      >
        Privacy Policy
      </h1>
      <p className="text-sm mb-10" style={{ color: "var(--muted)" }}>
        Coming soon
      </p>

      <div className="rounded-xl border p-8 text-center" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <p style={{ color: "var(--muted)" }}>
          Our Privacy Policy is being finalized and will be posted here shortly.
        </p>
      </div>
    </main>
  );
}
