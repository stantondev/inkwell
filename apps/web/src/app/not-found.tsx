import Link from "next/link";

export default function NotFound() {
  return (
    <div
      className="min-h-[60vh] flex items-center justify-center px-4"
      style={{ background: "var(--background)" }}
    >
      <div className="text-center max-w-md">
        <div
          className="text-6xl mb-4"
          style={{ color: "var(--muted)", opacity: 0.4 }}
          aria-hidden="true"
        >
          404
        </div>
        <h1
          className="text-2xl font-semibold mb-2"
          style={{ fontFamily: "var(--font-lora, Georgia, serif)", color: "var(--foreground)" }}
        >
          Page not found
        </h1>
        <p className="text-sm mb-8" style={{ color: "var(--muted)" }}>
          This page doesn&apos;t exist, or the ink has dried up.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/"
            className="rounded-full px-6 py-2 text-sm font-medium transition-colors"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            Go home
          </Link>
          <Link
            href="/explore"
            className="rounded-full border px-6 py-2 text-sm font-medium transition-colors"
            style={{ borderColor: "var(--border)", color: "var(--muted)" }}
          >
            Explore entries
          </Link>
        </div>
      </div>
    </div>
  );
}
