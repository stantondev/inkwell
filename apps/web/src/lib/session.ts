import { cookies } from "next/headers";
import { apiFetch } from "./api";

export const TOKEN_COOKIE = "inkwell_token";

export interface SessionUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  pronouns: string | null;
  ap_id: string;
  created_at: string;
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
 */
export async function getSession(): Promise<{
  user: SessionUser;
  token: string;
} | null> {
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
}
