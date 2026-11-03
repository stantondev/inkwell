import { NextRequest, NextResponse } from "next/server";
import { TOKEN_COOKIE } from "@/lib/session";
import { ATTRIBUTION_COOKIE, readAttribution } from "@/lib/attribution";

const API_URL = process.env.API_URL ?? "http://localhost:4000";
const TOKEN_MAX_AGE = 60 * 60 * 24 * 90; // 90 days

/**
 * GET /auth/bluesky/callback?code=...&state=...&iss=...
 *
 * Bluesky sends people back here after they approve. The API finishes the
 * sign-in (or the link, for someone already signed in) and we either set
 * the session cookie or go back to Settings.
 */
export async function GET(request: NextRequest) {
  const host = request.headers.get("host") ?? request.nextUrl.host;
  const proto = request.headers.get("x-forwarded-proto") ?? (host.startsWith("127.0.0.1") || host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;
  const signedIn = !!request.cookies.get(TOKEN_COOKIE)?.value;

  const fail = (message: string) =>
    NextResponse.redirect(
      new URL(
        signedIn
          ? `/settings/fediverse?bluesky_error=${encodeURIComponent(message)}`
          : `/login?error=${encodeURIComponent(message)}`,
        origin
      )
    );

  const params = request.nextUrl.searchParams;
  if (params.get("error")) return fail("You didn't approve the sign-in on Bluesky.");

  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) return fail("Bluesky didn't send the sign-in back. Please try again.");

  try {
    const res = await fetch(`${API_URL}/api/auth/bluesky/callback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, state, iss: params.get("iss"), attribution: readAttribution(request) }),
      cache: "no-store",
    });

    const data: { error?: string; token?: string; is_new?: boolean; linked?: boolean; redirect_to?: string } =
      await res.json().catch(() => ({}));

    if (!res.ok) return fail(data.error || "Signing in with Bluesky didn't work. Please try again.");

    // Only same-site paths.
    const requested = data.redirect_to;
    const safe = typeof requested === "string" && /^\/(?![\/\\])/.test(requested) ? requested : null;

    if (data.linked) {
      const to = new URL(safe || "/settings/fediverse", origin);
      to.searchParams.set("bluesky", "linked");
      return NextResponse.redirect(to);
    }

    if (!data.token) return fail("Signing in with Bluesky didn't work. Please try again.");

    const response = NextResponse.redirect(new URL(safe || (data.is_new ? "/welcome" : "/feed"), origin));
    response.cookies.set(TOKEN_COOKIE, data.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: TOKEN_MAX_AGE,
      path: "/",
    });
    response.cookies.delete(ATTRIBUTION_COOKIE);
    return response;
  } catch {
    return fail("We couldn't finish signing you in. Please try again.");
  }
}
