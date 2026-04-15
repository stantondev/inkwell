// Shared types, utility functions, and components used by both the main
// BillingHealthPanel and the AdvancedBillingTools subcomponent.
//
// The billing admin surface was growing into a 1700+ line file. Splitting
// the advanced debugging/cleanup sections into their own component file
// means the main panel stays focused on day-to-day operations (webhook
// health, reconcile, sync user, grant Plus) and the advanced section can
// live in its own file for the occasional deep-dive.
//
// This file holds the pieces that both need: interfaces for the shared data
// shapes returned from the admin API, and a small set of date/color helpers.

export interface WebhookDelivery {
  id: string;
  source: string;
  event_type: string | null;
  status: string;
  signature_valid: boolean | null;
  remote_ip: string | null;
  body_size: number | null;
  error: string | null;
  inserted_at: string;
}

export interface WebhookStats {
  last_delivery_at: string | null;
  total_24h: number;
  total_7d: number;
  by_status_24h: Record<string, number>;
  square_subscribers: number;
  square_donors: number;
  legacy_stripe_users: number;
  plus_square_active: number;
  plus_manually_granted: number;
  plus_legacy_stripe: number;
  plus_orphaned: number;
}

export interface HealthData {
  stats: WebhookStats;
  recent: WebhookDelivery[];
}

export interface PlusUser {
  id: string;
  username: string;
  email: string;
  inserted_at: string;
  subscription_status: string | null;
  subscription_expires_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  square_customer_id: string | null;
  square_subscription_id: string | null;
  ink_donor_status: string | null;
  ink_donor_amount_cents: number | null;
}

export interface PlusUsersData {
  square_active: PlusUser[];
  manually_granted: PlusUser[];
  legacy_stripe: PlusUser[];
  orphaned: PlusUser[];
}

export interface SquareSubscriptionRaw {
  subscription_id: string;
  status: string;
  plan_variation_id: string | null;
  plan_type: "plus" | "donor" | "unknown";
  customer_id: string | null;
  customer_email: string | null;
  customer_name: string | null;
  created_at: string | null;
  start_date: string | null;
  canceled_date: string | null;
  matched_user: {
    id: string;
    username: string;
    email: string;
    subscription_tier: string;
    square_subscription_id: string | null;
    square_donor_subscription_id: string | null;
  } | null;
}

export interface SquareSubscriptionsData {
  ok: boolean;
  subscriptions: SquareSubscriptionRaw[];
  total: number;
  error?: string;
}

export interface AttachResult {
  ok: boolean;
  type?: "plus" | "donor";
  user?: {
    username: string;
    email: string;
    subscription_tier: string;
    square_subscription_id: string | null;
    square_donor_subscription_id: string | null;
  };
  error?: string;
  detail?: string;
}

export interface SquarePaymentRaw {
  payment_id: string;
  status: string;
  amount_cents: number;
  currency: string;
  created_at: string | null;
  note: string | null;
  looks_like: "plus" | "donor" | "donation" | "unknown";
  card_brand: string | null;
  card_last4: string | null;
  receipt_url: string | null;
  order_id: string | null;
  customer_id: string | null;
  customer_email: string | null;
  customer_name: string | null;
  buyer_email: string | null;
  matched_user: {
    id: string;
    username: string;
    email: string;
    subscription_tier: string;
    square_subscription_id: string | null;
    square_donor_subscription_id: string | null;
  } | null;
}

export interface SquarePaymentsData {
  ok: boolean;
  payments: SquarePaymentRaw[];
  total: number;
  error?: string;
}

export interface GraceUserSummary {
  id: string;
  username: string;
  email: string;
  subscription_expires_at: string | null;
}

export interface GraceExpirationResult {
  dry_run: boolean;
  checked_at: string;
  candidates: GraceUserSummary[];
  downgraded: GraceUserSummary[];
  errors: Array<{ user_id: string; username: string; reason: string }>;
}

export interface GraceExpirationResponse {
  ok: boolean;
  result?: GraceExpirationResult;
  error?: string;
}

// ── Utility functions ─────────────────────────────────────────────────────

/**
 * Phoenix's NaiveDateTime serializes without a timezone suffix. Force UTC
 * by appending 'Z' if the string has no offset info, otherwise JS parses
 * it as local time and produces negative diffs.
 */
export function parseUtc(iso: string): number {
  const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso);
  return new Date(hasTz ? iso : iso + "Z").getTime();
}

export function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - parseUtc(iso);
  const secs = Math.max(0, Math.floor(diff / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function formatDate(iso: string): string {
  try {
    const d = new Date(parseUtc(iso));
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

export function statusColor(status: string): { bg: string; fg: string } {
  switch (status) {
    case "received":
    case "processed":
      return { bg: "var(--success, #16a34a)", fg: "white" };
    case "signature_failed":
      return { bg: "var(--danger, #dc2626)", fg: "white" };
    case "parse_failed":
    case "handler_failed":
    case "missing_body":
      return { bg: "#f59e0b", fg: "white" };
    default:
      return { bg: "var(--muted)", fg: "white" };
  }
}

// ── Shared components ─────────────────────────────────────────────────────

/**
 * A single stat cell with a large serif value and a small uppercase label.
 * Used in both the main panel (top metrics) and the advanced tools
 * (ghost Plus detection metrics). Supports tone variants for semantic color.
 */
export function HealthStat({
  label,
  value,
  muted,
  tone,
}: {
  label: string;
  value: string;
  muted?: boolean;
  tone?: "success" | "warning" | "info";
}) {
  let color = "var(--foreground)";
  if (muted) color = "var(--muted)";
  else if (tone === "success") color = "var(--success, #16a34a)";
  else if (tone === "warning") color = "#f59e0b";
  else if (tone === "info") color = "var(--accent)";

  return (
    <div>
      <div
        className="text-lg font-semibold"
        style={{ color, fontFamily: "var(--font-lora, Georgia, serif)" }}
      >
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
        {label}
      </div>
    </div>
  );
}
