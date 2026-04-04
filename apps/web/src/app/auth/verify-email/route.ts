import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

/**
 * GET /auth/verify-email?token=TOKEN
 *
 * Called when user clicks the email change verification link.
 * Forwards to Phoenix, then redirects to /settings with result params.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  // Build public-facing base URL (request.url on Fly.io is http://0.0.0.0:3000)
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const host = request.headers.get("host") || "inkwell.social";
  const baseUrl = `${proto}://${host}`;

  if (!token) {
    return NextResponse.redirect(new URL("/settings?email_error=missing_token", baseUrl));
  }

  try {
    const res = await fetch(
      `${API_URL}/api/auth/verify-email?token=${encodeURIComponent(token)}`,
      { cache: "no-store" }
    );

    if (res.ok) {
      const data = await res.json();
      return NextResponse.redirect(
        new URL(`/settings?email_updated=true&new_email=${encodeURIComponent(data.email || "")}`, baseUrl)
      );
    }

    await res.json().catch(() => ({}));

    if (res.status === 409) {
      return NextResponse.redirect(new URL("/settings?email_error=taken", baseUrl));
    }

    return NextResponse.redirect(new URL("/settings?email_error=expired", baseUrl));
  } catch {
    return NextResponse.redirect(new URL("/settings?email_error=server", baseUrl));
  }
}
