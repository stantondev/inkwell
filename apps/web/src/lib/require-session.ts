import { redirect } from "next/navigation";
import { getSession, getToken, type SessionUser } from "./session";
import { safeReturnPath } from "./return-to";

/**
 * Where to send someone who has to sign in before seeing `next`.
 *
 * With a token cookie that the API rejected (expired, revoked, signed out on
 * another device), go through /auth/expired, which clears the dead cookie.
 * Left in place, the middleware keeps treating the visitor as signed in: it
 * refreshes the cookie on every visit and sends "/" to /feed, so they never
 * see a way back in. Until 2026-09-26 /feed answered that visitor with a 404.
 */
export async function signInPath(next?: string | null): Promise<string> {
  const path = safeReturnPath(next);
  const qs = path ? `?next=${encodeURIComponent(path)}` : "";
  return (await getToken()) ? `/auth/expired${qs}` : `/login${qs}`;
}

/**
 * For pages that only work signed in: the session, or a redirect to sign in
 * and come back to `next`.
 *
 * An API outage never lands here: getSession() throws for that, and the
 * error boundary shows the self-recovering "Reconnecting" screen instead of
 * treating a restart as "signed out".
 */
export async function requireSession(next: string): Promise<{ user: SessionUser; token: string }> {
  const session = await getSession();
  if (session) return session;
  redirect(await signInPath(next));
}
