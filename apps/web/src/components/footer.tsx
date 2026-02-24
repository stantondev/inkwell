import Link from "next/link";

export function Footer() {
  return (
    <footer
      className="border-t py-8 mt-auto"
      style={{ borderColor: "var(--border)" }}
    >
      <div
        className="mx-auto max-w-7xl px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm"
        style={{ color: "var(--muted)" }}
      >
        <span style={{ fontFamily: "var(--font-lora, Georgia, serif)", fontWeight: 600 }}>
          Inkwell
        </span>
        <div className="flex flex-wrap gap-3 sm:gap-5">
          <Link href="/terms" className="hover:underline">Terms</Link>
          <Link href="/privacy" className="hover:underline">Privacy</Link>
          <Link href="/brand" className="hover:underline">Brand</Link>
          <Link href="/roadmap" className="hover:underline">Roadmap</Link>
          <Link href="/roadmap/new" className="hover:underline">Submit Feedback</Link>
        </div>
        <span>&copy; 2026 Inkwell</span>
      </div>
    </footer>
  );
}
