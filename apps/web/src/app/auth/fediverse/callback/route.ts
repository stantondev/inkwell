import { NextRequest, NextResponse } from "next/server";
import { TOKEN_COOKIE } from "@/lib/session";

const API_URL = process.env.API_URL ?? "http://localhost:4000";
const TOKEN_MAX_AGE = 60 * 60 * 24 * 90; // 90 days

/**
 * GET /auth/fediverse/callback?code=...&state=...
 *
 * OAuth redirect URI — Mastodon sends users back here after authorization.
 * Exchanges the code server-side via Phoenix, sets httpOnly cookie, redirects.
 */
export async function GET(request: NextRequest) {
  const host = request.headers.get("host") ?? request.nextUrl.host;
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const origin = `${proto}://${host}`;

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");

  // User denied authorization on the remote instance
  if (error) {
    return NextResponse.redirect(
      new URL("/login?error=oauth_denied", origin)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/login?error=missing_params", origin)
    );
  }

  try {
    const res = await fetch(`${API_URL}/api/auth/fediverse/callback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, state }),
      cache: "no-store",
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const errorParam = encodeURIComponent(
        (data as { error?: string }).error || "oauth_failed"
      );
      return NextResponse.redirect(
        new URL(`/login?error=${errorParam}`, origin)
      );
    }

    const data: {
      ok: boolean;
      token: string;
      is_new: boolean;
      redirect_to: string;
      user?: { settings?: { onboarded?: boolean } };
    } = await res.json();

    const destination =
      data.redirect_to ||
      (data.is_new ? "/welcome" : "/feed");
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
