import type { SessionUser } from "@/lib/session";
import { SidebarNav } from "./sidebar-nav";

/**
 * Sidebar — "The Contents Page"
 *
 * Fixed left sidebar for desktop (lg+). Styled as a book's table of contents
 * with Roman numeral sections, dot leaders, Lora serif typography, and
 * paper texture. Hidden below 1024px where the top nav + hamburger is used.
 */
export function Sidebar({ user }: { user: SessionUser }) {
  return (
    <aside
      className="sidebar-nav hidden lg:flex flex-col"
      aria-label="Main navigation"
    >
      <SidebarNav
        username={user.username}
        displayName={user.display_name}
        avatarUrl={user.avatar_url}
        avatarFrame={user.avatar_frame}
        subscriptionTier={user.subscription_tier}
        isAdmin={user.is_admin}
        initialNotificationCount={user.unread_notification_count ?? 0}
        initialLetterCount={user.unread_letter_count ?? 0}
        initialDraftCount={user.draft_count ?? 0}
      />
    </aside>
  );
}
