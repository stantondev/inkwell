import { NextRequest, NextResponse } from "next/server";
import { TOKEN_COOKIE } from "@/lib/session";

const API_URL = process.env.API_URL ?? "http://localhost:4000";
const TOKEN_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/**
 * GET /auth/verify?token=<magic-link-token>
 *
 * Called when the user clicks their magic link.
 * Forwards the token to Phoenix, receives a long-lived API token,
 * stores it in an httpOnly cookie, and redirects to /feed.
 */
export async function GET(request: NextRequest) {
  // Use the Host header to build redirects so the browser gets the real IP,
  // not 0.0.0.0 (which is what Next.js sees as its own address).
  const host = request.headers.get("host") ?? request.nextUrl.host;
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const origin = `${proto}://${host}`;

  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/login?error=missing_token", origin));
  }

  try {
    const res = await fetch(
      `${API_URL}/api/auth/verify?token=${encodeURIComponent(token)}`,
      { cache: "no-store" }
    );

    if (!res.ok) {
      return NextResponse.redirect(
        new URL("/login?error=invalid_token", origin)
      );
    }

    const data: { ok: boolean; token: string; user?: { settings?: { onboarded?: boolean } } } = await res.json();

    // Redirect new users to onboarding, returning users to feed
    const destination = data.user?.settings?.onboarded ? "/feed" : "/welcome";
    const response = NextResponse.redirect(new URL(destination, origin));
    response.cookies.set(TOKEN_COOKIE, data.token, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: TOKEN_MAX_AGE,
      path: "/",
    });

    return response;
  } catch {
    return NextResponse.redirect(
      new URL("/login?error=server_error", origin)
    );
  }
}
