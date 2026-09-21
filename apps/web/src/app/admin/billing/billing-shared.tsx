// Types and small helpers shared by the admin Billing page and its
// Troubleshooting section.

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
