import { headers } from "next/headers";
import type { SessionUser } from "@/lib/session";
import { Nav } from "./nav";
import { Sidebar } from "./sidebar";
import { Footer } from "./footer";
import { BottomTabBar } from "./bottom-tab-bar";
import { MobileTopBar } from "./mobile-top-bar";
import { SearchCommand } from "./search-command";

/**
 * AppShell — layout wrapper that handles sidebar vs top nav routing.
 *
 * - Logged-in desktop (lg+): left sidebar + content with margin-left
 * - Logged-in mobile/tablet (<lg): mobile top bar + bottom tab bar
 * - Logged-out (all sizes): top nav with Sign in / Get started
 * - Custom domain: simplified chrome — author name header + Powered by Inkwell footer
 */
export async function AppShell({
  user,
  children,
}: {
  user: SessionUser | null;
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const customDomain = headersList.get("x-custom-domain");
  const customDomainUsername = headersList.get("x-custom-domain-username");

  // Custom domain mode — no header, no sidebar, no app nav
  if (customDomain && customDomainUsername) {
    return (
      <main className="flex flex-col min-h-screen no-sidebar">
        {children}
      </main>
    );
  }

  // Standard mode
  return (
    <>
      {/* Logged-in mobile: MobileTopBar (<lg only) */}
      {user && (
        <div className="lg:hidden">
          <MobileTopBar
            username={user.username}
            displayName={user.display_name || user.username}
            avatarUrl={user.avatar_url}
            avatarFrame={user.avatar_frame}
            avatarAnimation={user.avatar_animation}
            subscriptionTier={user.subscription_tier}
            inkDonorStatus={user.ink_donor_status}
            isAdmin={user.is_admin}
            unreadLetterCount={user.unread_letter_count ?? 0}
            unreadNotificationCount={user.unread_notification_count ?? 0}
            draftCount={user.draft_count ?? 0}
            selfHosted={user.self_hosted}
          />
        </div>
      )}

      {/* Logged-out: standard Nav (all sizes) */}
      {!user && <Nav user={null} />}

      {/* Sidebar — desktop only, logged-in only */}
      {user && <Sidebar user={user} />}

      {/* Global Cmd/Ctrl+K search shortcut — logged-in only */}
      {user && <SearchCommand />}

      {/* Main content area — bottom padding on mobile for tab bar clearance */}
      <main className={`app-content flex flex-col min-h-screen ${user ? "lg:min-h-0 has-bottom-tabs" : "no-sidebar"}`}>
        <div className="flex-1">
          {children}
        </div>
        <Footer selfHosted={user?.self_hosted} />
      </main>

      {/* Bottom tab bar — mobile/tablet only, logged-in only */}
      {user && (
        <BottomTabBar
          username={user.username}
          avatarUrl={user.avatar_url}
          unreadNotificationCount={user.unread_notification_count ?? 0}
          unreadLetterCount={user.unread_letter_count ?? 0}
          draftCount={user.draft_count ?? 0}
        />
      )}
    </>
  );
}
