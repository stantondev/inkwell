import Link from "next/link";
import type { SessionUser } from "@/lib/session";
import { SignOutButton } from "./sign-out-button";
import { MobileMenu } from "./mobile-menu";
import { NavBadges } from "./nav-badges";
import { AvatarWithFrame } from "./avatar-with-frame";

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
            <Link href="/settings" className="text-sm font-medium transition-colors"
              style={{ color: "var(--muted)" }}>Settings</Link>
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
                <AvatarWithFrame url={user.avatar_url} name={user.display_name} size={28} frame={user.avatar_frame} subscriptionTier={user.subscription_tier} />
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
