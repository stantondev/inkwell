import Link from "next/link";
import type { SessionUser } from "@/lib/session";

// ---------------------------------------------------------------------------
// InkwellLogo
// ---------------------------------------------------------------------------
function InkwellLogo() {
  return (
    <Link href="/" className="flex items-center group" aria-label="Inkwell home">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/inkwell-logo.svg"
        alt="Inkwell"
        className="h-10 w-auto transition-transform group-hover:-rotate-1 dark:brightness-0 dark:invert"
      />
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Nav — server component, receives real user from layout
//
// Logged-in mobile (<lg): logo only — bottom tab bar handles all navigation
// Logged-out (all sizes): logo + Sign in / Get started
// ---------------------------------------------------------------------------
export function Nav({ user }: { user: SessionUser | null }) {
  return (
    <header className="sticky top-0 z-40 border-b relative"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        {/* Left: logo */}
        <InkwellLogo />

        {/* Right: actions — logged-out only (logged-in uses bottom tab bar) */}
        {!user && (
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-medium transition-colors"
              style={{ color: "var(--muted)" }}>Sign in</Link>
            <Link href="/get-started"
              className="rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors"
              style={{ background: "var(--accent)", color: "#fff" }}>
              Get started
            </Link>
          </div>
        )}
      </nav>
    </header>
  );
}

export default Nav;
