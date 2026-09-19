import { cache } from "react";
import { cookies } from "next/headers";
import { apiFetch, ApiError, isApiUnavailable } from "./api";

export const TOKEN_COOKIE = "inkwell_token";

/** Set on the browser that requested a sign-in link (see api/auth/magic-link). */
export const HANDOFF_COOKIE = "inkwell_lsid";

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
  subscription_status?: string | null;
  subscription_expires_at?: string | null;
  founding_member_number?: number | null;
  plus_trial_eligible?: boolean;
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
 *
 * Returns null only when there is no token or the API rejects it (4xx), i.e.
 * the person really is signed out. If the API can't be reached (deploy
 * restart, 502/503, timeout) this THROWS an ApiError carrying
 * API_UNAVAILABLE_DIGEST. Before 2026-09-19 it returned null for outages too,
 * so every page treated a 30-second API restart as "signed out" and sent
 * people to /login. error.tsx shows a self-recovering "reconnecting" screen
 * for that digest instead.
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
  } catch (err) {
    if (isApiUnavailable(err)) throw err;
    if (err instanceof ApiError) return null;
    // Anything else (e.g. a malformed response) — treat as unavailable rather
    // than silently signing the person out.
    throw new ApiError("Could not load session", 503);
  }
});

/**
 * getSession() for places that must never throw (the root layout, which wraps
 * every page including error screens). `unavailable` is true when the API
 * couldn't be reached, so the chrome can avoid showing "Sign in" to someone
 * who is signed in, while the page itself shows the reconnecting screen.
 */
export async function getSessionSafe(): Promise<{
  session: { user: SessionUser; token: string } | null;
  unavailable: boolean;
}> {
  try {
    return { session: await getSession(), unavailable: false };
  } catch {
    return { session: null, unavailable: true };
  }
}
