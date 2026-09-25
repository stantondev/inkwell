import Link from "next/link";
import type { SessionUser } from "@/lib/session";
import { BackButton } from "./back-button";
import { PublicNavLinks } from "./public-nav-links";

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
// Logged-out (all sizes): logo + Explore/Gazette/About + Sign in / Get started
// (phones keep Explore only, as an icon + word)
// ---------------------------------------------------------------------------
export function Nav({ user, hideAuthLinks = false }: { user: SessionUser | null; hideAuthLinks?: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b relative"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        {/* Left: back button (mobile, logged-in) + logo */}
        <div className="flex items-center gap-1">
          {user && <BackButton />}
          <InkwellLogo />
        </div>

        {/* Right: where to look + Sign in / Get started (signed-out only;
            signed-in phones use the tab bar) */}
        {!user && (
          <div className="flex items-center gap-2 sm:gap-4">
            <PublicNavLinks />
            {!hideAuthLinks && (
              <>
                <Link href="/login" className="text-sm font-medium whitespace-nowrap transition-colors hover:text-[var(--foreground)]"
                  style={{ color: "var(--muted)" }}>Sign in</Link>
                <Link href="/get-started"
                  className="rounded-full px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap transition-opacity hover:opacity-90"
                  style={{ background: "var(--accent)", color: "var(--background)" }}>
                  Get started
                </Link>
              </>
            )}
          </div>
        )}
      </nav>
    </header>
  );
}

export default Nav;
