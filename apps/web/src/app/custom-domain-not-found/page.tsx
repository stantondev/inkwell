import Link from "next/link";

export const metadata = {
  title: "Domain Not Connected",
};

export default function CustomDomainNotFoundPage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
      <div
        className="max-w-md w-full text-center rounded-xl border p-8"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div className="text-4xl mb-4" aria-hidden="true">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mx-auto"
            style={{ color: "var(--muted)" }}
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        </div>
        <h1
          className="text-xl font-bold mb-3"
          style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
        >
          Domain Not Connected
        </h1>
        <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
          This domain isn&apos;t connected to an Inkwell profile. If you own this
          domain, you can set it up in your{" "}
          <Link
            href="https://inkwell.social/settings/domain"
            className="underline hover:opacity-80"
            style={{ color: "var(--accent)" }}
          >
            Inkwell settings
          </Link>
          .
        </p>
        <Link
          href="https://inkwell.social"
          className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
          style={{ background: "var(--accent)", color: "white" }}
        >
          Visit Inkwell
        </Link>
      </div>
    </div>
  );
}
