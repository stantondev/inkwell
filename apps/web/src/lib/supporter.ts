import type { SessionUser } from "@/lib/session";

/**
 * Anyone who already supports Inkwell financially.
 *
 * Plus subscribers, Founding Members and active Ink Donors have all already
 * said yes. Asking them again — "Keep the ink flowing, $1/mo" in the sidebar
 * next to the Plus badge they paid for — reads as nagging, so every donation
 * CTA is gated on this.
 */
export function isSupporter(
  user: Pick<
    SessionUser,
    "subscription_tier" | "ink_donor_status" | "founding_member_number" | "self_hosted"
  > | null | undefined
): boolean {
  if (!user) return false;
  if (user.self_hosted) return true;
  if (user.subscription_tier === "plus") return true;
  if (user.founding_member_number != null) return true;
  if (user.ink_donor_status === "active") return true;
  return false;
}
