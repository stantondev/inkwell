import Link from "next/link";
import type { SessionUser } from "@/lib/session";
import { SignOutButton } from "./sign-out-button";
import { MobileMenu } from "./mobile-menu";
import { NavBadges } from "./nav-badges";

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
        className="h-8 w-auto transition-transform group-hover:-rotate-1 dark:brightness-0 dark:invert"
      />
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------
function Avatar({ url, name, size = 32 }: { url: string | null; name: string; size?: number }) {
  const initials = (name || "?").split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} width={size} height={size}
      className="rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <div className="rounded-full bg-accent-light flex items-center justify-center text-accent font-semibold text-xs select-none"
      style={{ width: size, height: size, fontSize: size * 0.38 }} aria-label={name}>
      {initials}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nav — server component, receives real user from layout
// ---------------------------------------------------------------------------
export function Nav({ user }: { user: SessionUser | null }) {
  return (
    <header className="sticky top-0 z-40 border-b relative"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        {/* Left: logo */}
        <InkwellLogo />

        {/* Center: main navigation (logged-in only) */}
        {user && (
          <div className="hidden sm:flex items-center gap-5">
            <Link href="/feed" className="text-sm font-medium transition-colors"
              style={{ color: "var(--muted)" }}>Feed</Link>
            <Link href="/explore" className="text-sm font-medium transition-colors"
              style={{ color: "var(--muted)" }}>Explore</Link>
            <Link href="/pen-pals" className="text-sm font-medium transition-colors"
              style={{ color: "var(--muted)" }}>Pen Pals</Link>
            <Link href="/saved" className="text-sm font-medium transition-colors"
              style={{ color: "var(--muted)" }}>Bookmarks</Link>
            <Link href="/search" className="text-sm font-medium transition-colors"
              style={{ color: "var(--muted)" }}>Search</Link>
            <Link href="/roadmap" className="text-sm font-medium transition-colors"
              style={{ color: "var(--muted)" }}>Roadmap</Link>
            {user.subscription_tier !== "plus" && (
              <Link href="/settings/billing"
                className="text-xs font-medium rounded-full px-2.5 py-1 border transition-colors"
                style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>
                ✦ Plus
              </Link>
            )}
            {user.is_admin && (
              <Link href="/admin" className="text-sm font-medium transition-colors"
                style={{ color: "var(--muted)" }}>Admin</Link>
            )}
          </div>
        )}

        {/* Right: actions */}
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <MobileMenu
                username={user.username}
                subscriptionTier={user.subscription_tier}
                isAdmin={user.is_admin}
                unreadNotificationCount={user.unread_notification_count ?? 0}
                unreadLetterCount={user.unread_letter_count ?? 0}
                draftCount={user.draft_count ?? 0}
              />

              <Link href="/editor"
                className="hidden sm:inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors"
                style={{ background: "var(--accent)", color: "#fff" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
                Write
              </Link>

              <NavBadges
                initialDraftCount={user.draft_count ?? 0}
                initialNotificationCount={user.unread_notification_count ?? 0}
                initialLetterCount={user.unread_letter_count ?? 0}
              />

              <Link href={`/${user.username}`}
                className="flex items-center gap-2 rounded-full p-0.5 transition-opacity hover:opacity-80"
                aria-label="Your profile">
                <Avatar url={user.avatar_url} name={user.display_name} size={32} />
              </Link>

              <Link href="/settings"
                className="hidden sm:flex items-center justify-center w-8 h-8 rounded-full transition-colors hover:bg-[var(--surface-hover)]"
                aria-label="Settings">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
              </Link>

              <span className="hidden sm:block">
                <SignOutButton />
              </span>
            </>
          ) : (
            <>
              <Link href="/login" className="text-sm font-medium transition-colors"
                style={{ color: "var(--muted)" }}>Sign in</Link>
              <Link href="/get-started"
                className="rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors"
                style={{ background: "var(--accent)", color: "#fff" }}>
                Get started
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}

export default Nav;
