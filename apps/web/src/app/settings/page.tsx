import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { apiFetch } from "@/lib/api";
import { SettingsOverview } from "./settings-overview";

/**
 * Settings home — an overview of every area, what's inside it, and where it
 * currently stands. `/settings/profile` holds what used to live at this URL.
 */

interface MeResponse {
  username?: string;
  display_name?: string;
  avatar_url?: string | null;
  avatar_frame?: string | null;
  subscription_tier?: string;
  subscription_status?: string | null;
  founding_member_number?: number | null;
  ink_donor_status?: string | null;
  profile_theme?: string | null;
  profile_layout?: string | null;
  profile_html?: string | null;
  profile_css?: string | null;
  pinned_entry_ids?: string[] | null;
  social_links?: Record<string, string> | null;
  newsletter_enabled?: boolean;
  subscriber_count?: number;
  sends_this_month?: number;
  send_limit?: number;
  support_url?: string | null;
  post_email_enabled?: boolean;
  settings?: Record<string, unknown> | null;
}

export default async function SettingsHomePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // One request covers almost every status chip on the page. A failure here is
  // not fatal — the grid still renders, just without the live detail.
  let me: MeResponse | null = null;
  try {
    const res = await apiFetch<{ data: MeResponse }>("/api/me", {}, session.token);
    me = res.data;
  } catch {
    me = null;
  }

  const settings = (me?.settings ?? {}) as Record<string, unknown>;
  const redactedWords = Array.isArray(settings.redacted_words)
    ? (settings.redacted_words as string[]).length
    : 0;
  const pinnedCards = Array.isArray(settings.pinned_settings)
    ? (settings.pinned_settings as string[])
    : [];

  const tier = me?.subscription_tier ?? session.user.subscription_tier ?? "free";
  const isPlus = tier === "plus";
  const founding = me?.founding_member_number ?? session.user.founding_member_number ?? null;
  const donor = me?.ink_donor_status ?? session.user.ink_donor_status ?? null;

  // Short, factual status lines. `null` means "nothing worth saying".
  const status: Record<string, string | null> = {
    profile: me?.display_name ? `${me.display_name} · @${me.username}` : null,
    avatar: me?.avatar_url ? "Set" : "No picture yet",
    notifications: settings.push_notifications_disabled
      ? "Push paused"
      : settings.email_notifications_disabled
        ? "Email off"
        : "Email on",
    customize: me?.profile_theme
      ? `${titleCase(me.profile_theme)} theme${me.profile_html ? " · custom HTML" : ""}`
      : null,
    pinned: me?.pinned_entry_ids?.length
      ? `${me.pinned_entry_ids.length} of 3 pinned`
      : "None pinned",
    "top-friends": null,
    domain: isPlus ? null : "Plus feature",
    series: null,
    polls: null,
    "post-by-email": me?.post_email_enabled ? "On" : "Off",
    import: null,
    newsletter: me?.newsletter_enabled
      ? `${me.subscriber_count ?? 0} subscriber${me.subscriber_count === 1 ? "" : "s"} · ${me.sends_this_month ?? 0}/${me.send_limit ?? 0} sends this month`
      : "Off",
    invite: null,
    fediverse: me?.username ? `@${me.username}@inkwell.social` : null,
    support: me?.support_url ? "Link set" : "No link",
    filters: null,
    redactions: redactedWords ? `${redactedWords} word${redactedWords === 1 ? "" : "s"}` : "None",
    "content-safety": settings.show_sensitive_content ? "Sensitive shown" : "Sensitive hidden",
    blocked: null,
    billing: founding
      ? `Founding Member #${founding}`
      : isPlus
        ? donor === "active"
          ? "Plus · Ink Donor"
          : `Plus${me?.subscription_status === "trialing" ? " trial" : ""}`
        : donor === "active"
          ? "Free · Ink Donor"
          : "Free",
    api: null,
    export: null,
    account: null,
  };

  return (
    <SettingsOverview
      displayName={me?.display_name ?? session.user.display_name ?? ""}
      username={me?.username ?? session.user.username ?? ""}
      avatarUrl={me?.avatar_url ?? session.user.avatar_url ?? null}
      avatarFrame={me?.avatar_frame ?? session.user.avatar_frame ?? null}
      tier={tier}
      foundingNumber={founding}
      donorStatus={donor}
      status={status}
      initialPinned={pinnedCards}
      loadFailed={me === null}
    />
  );
}

function titleCase(s: string) {
  return s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
