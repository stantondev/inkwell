import type { SessionUser } from "@/lib/session";
import { getToken } from "@/lib/session";
import { apiFetch } from "@/lib/api";
import { SidebarNav } from "./sidebar-nav";
import type { PollData } from "./poll-widget";

/**
 * Sidebar — "The Contents Page"
 *
 * Fixed left sidebar for desktop (lg+). Styled as a book's table of contents
 * with Roman numeral sections, dot leaders, Lora serif typography, and
 * paper texture. Hidden below 1024px where the top nav + hamburger is used.
 */
export async function Sidebar({ user }: { user: SessionUser }) {
  // Fetch active platform poll for the sidebar widget
  let activePoll: PollData | null = null;
  try {
    const token = await getToken();
    const data = await apiFetch<{ data: PollData | null }>("/api/polls/active", {}, token);
    activePoll = data.data;
  } catch {}

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
        avatarAnimation={user.avatar_animation}
        subscriptionTier={user.subscription_tier}
        inkDonorStatus={user.ink_donor_status}
        isAdmin={user.is_admin}
        initialNotificationCount={user.unread_notification_count ?? 0}
        initialLetterCount={user.unread_letter_count ?? 0}
        initialDraftCount={user.draft_count ?? 0}
        activePoll={activePoll}
        serverSidebarHidden={user.settings?.sidebar_hidden as boolean | undefined}
      />
    </aside>
  );
}
