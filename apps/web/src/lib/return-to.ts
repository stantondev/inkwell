// Where to send someone after they sign in. The middleware and "Sign in" links
// pass `?next=/some/path` to /login; the magic link may be opened in another
// tab, so the path is kept in a short-lived cookie rather than in the URL.
// Onboarding always wins: a new account goes to /welcome first.

export const RETURN_TO_COOKIE = "inkwell_next";
const MAX_AGE_SECONDS = 30 * 60; // the life of a magic link

/** A same-site path only: "/x", never "//host", "/\\host" or an auth page. */
export function safeReturnPath(value: string | null | undefined): string | null {
  if (!value || value.length > 300) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  if (/^\/(login|get-started|auth|welcome)(\/|\?|#|$)/.test(value)) return null;
  return value;
}

/** Client: remember `?next=` from the current page, if there is one. */
export function rememberReturnTo(next: string | null | undefined) {
  const path = safeReturnPath(next);
  if (!path || typeof document === "undefined") return;
  document.cookie = `${RETURN_TO_COOKIE}=${encodeURIComponent(path)}; Max-Age=${MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
}

/** Client: the remembered path (and forget it), or null. */
export function takeReturnTo(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${RETURN_TO_COOKIE}=([^;]*)`));
  if (!match) return null;
  document.cookie = `${RETURN_TO_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
  try {
    return safeReturnPath(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

/** Server: the remembered path from a raw cookie value, or null. */
export function readReturnTo(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    return safeReturnPath(decodeURIComponent(raw));
  } catch {
    return null;
  }
}

/** Where a freshly signed-in person should land. */
export function signedInDestination(onboarded: boolean | undefined, returnTo: string | null): string {
  if (!onboarded) return "/welcome";
  return returnTo ?? "/feed";
}
