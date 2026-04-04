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

  if (!token) {
    return NextResponse.redirect(new URL("/settings?email_error=missing_token", request.url));
  }

  try {
    const res = await fetch(
      `${API_URL}/api/auth/verify-email?token=${encodeURIComponent(token)}`,
      { cache: "no-store" }
    );

    if (res.ok) {
      const data = await res.json();
      return NextResponse.redirect(
        new URL(`/settings?email_updated=true&new_email=${encodeURIComponent(data.email || "")}`, request.url)
      );
    }

    const data = await res.json().catch(() => ({}));

    if (res.status === 409) {
      return NextResponse.redirect(new URL("/settings?email_error=taken", request.url));
    }

    return NextResponse.redirect(new URL("/settings?email_error=expired", request.url));
  } catch {
    return NextResponse.redirect(new URL("/settings?email_error=server", request.url));
  }
}
