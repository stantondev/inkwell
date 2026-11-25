import type { Metadata } from "next";
import { requireSession } from "@/lib/require-session";
import { YouMenuBody, YouMenuProfile, type YouMenuProps } from "@/components/you-sheet";

export const metadata: Metadata = { title: "You", robots: { index: false, follow: false } };

/**
 * The You menu as a page: what the Inkwell app's You tab opens (the website
 * shows the same menu as a sheet from its own tab bar).
 */
export default async function YouPage() {
  const { user } = await requireSession("/you");
  const menu: YouMenuProps = {
    username: user.username,
    displayName: user.display_name || user.username,
    avatarUrl: user.avatar_url,
    avatarFrame: user.avatar_frame,
    avatarAnimation: user.avatar_animation,
    subscriptionTier: user.subscription_tier,
    inkDonorStatus: user.ink_donor_status,
    foundingMemberNumber: user.founding_member_number,
    isAdmin: user.is_admin,
    selfHosted: user.self_hosted,
    unreadLetterCount: user.unread_letter_count ?? 0,
    draftCount: user.draft_count ?? 0,
  };
  return (
    <div className="you-page">
      <div className="you-page-profile">
        <YouMenuProfile {...menu} />
      </div>
      <div className="you-page-body">
        <YouMenuBody {...menu} />
      </div>
    </div>
  );
}
