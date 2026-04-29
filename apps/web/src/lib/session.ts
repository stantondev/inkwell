import { cache } from "react";
import { cookies } from "next/headers";
import { apiFetch } from "./api";

export const TOKEN_COOKIE = "inkwell_token";

export interface SessionUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  avatar_config?: Record<string, unknown> | null;
  avatar_frame?: string | null;
  avatar_animation?: string | null;
  profile_effect?: string | null;
  profile_effect_intensity?: string | null;
  bio: string | null;
  pronouns: string | null;
  ap_id: string;
  created_at: string;
  is_admin?: boolean;
  subscription_tier?: string;
  unread_notification_count?: number;
  unread_letter_count?: number;
  draft_count?: number;
  newsletter_enabled?: boolean;
  subscriber_count?: number;
  terms_accepted_at?: string | null;
  ink_donor_status?: string | null;
  ink_donor_amount_cents?: number | null;
  has_writer_plan?: boolean;
  preferred_language?: string | null;
  post_email_enabled?: boolean;
  post_email_address?: string | null;
  self_hosted?: boolean;
  needs_resubscribe?: boolean;
  settings?: { onboarded?: boolean; [key: string]: unknown };
}

/**
 * Read the raw token cookie (server-side only).
 */
export async function getToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(TOKEN_COOKIE)?.value ?? null;
}

/**
 * Validate the token against Phoenix and return the current user.
 * Returns null if the token is missing, invalid, or the API is unreachable.
 *
 * Wrapped in `react.cache()` so multiple `getSession()` calls within the same
 * SSR render share a single API roundtrip. Without this, every server
 * component that needs the session (root layout + page + nested components)
 * would each make their own `/api/auth/me` request — `apiFetch` uses
 * `cache: "no-store"` which defeats Next's automatic dedup.
 *
 * apiFetch handles retry on 5xx for Fly.io cold starts automatically.
 */
export const getSession = cache(async (): Promise<{
  user: SessionUser;
  token: string;
} | null> => {
  const token = await getToken();
  if (!token) return null;

  try {
    const data = await apiFetch<{ data: SessionUser }>(
      "/api/auth/me",
      {},
      token
    );
    return { user: data.data, token };
  } catch {
    return null;
  }
});
