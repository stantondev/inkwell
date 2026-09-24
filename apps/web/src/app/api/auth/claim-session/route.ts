import { NextRequest, NextResponse } from "next/server";
import { TOKEN_COOKIE } from "@/lib/session";
import { RETURN_TO_COOKIE, readReturnTo, signedInDestination } from "@/lib/return-to";

const API_URL = process.env.API_URL ?? "http://localhost:4000";
const TOKEN_MAX_AGE = 60 * 60 * 24 * 90; // 90 days

/**
 * GET /api/auth/claim-session?id=LOGIN_SESSION_ID
 *
 * PWA login handoff: polls this endpoint to detect when the browser has
 * completed magic link verification. When the session is ready, this route
 * sets the auth cookie in the PWA's own cookie jar.
 */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `${API_URL}/api/auth/claim-session?id=${encodeURIComponent(id)}`,
      { cache: "no-store" }
    );

    const data = await res.json();

    // Session ready — set the cookie in this context (the PWA's cookie jar)
    if (data.ok && data.token) {
      const returnTo = readReturnTo(request.cookies.get(RETURN_TO_COOKIE)?.value);
      const destination = signedInDestination(data.user?.settings?.onboarded, returnTo);

      const response = NextResponse.json({ ok: true, destination });
      if (returnTo) response.cookies.set(RETURN_TO_COOKIE, "", { maxAge: 0, path: "/" });
      response.cookies.set(TOKEN_COOKIE, data.token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: TOKEN_MAX_AGE,
        path: "/",
      });
      return response;
    }

    // Still waiting for browser verification. awaiting_code means the link
    // has been opened in another browser or app, which is the only moment
    // this screen's 4-digit code is worth showing.
    if (data.pending) {
      return NextResponse.json({ pending: true, awaiting_code: !!data.awaiting_code });
    }

    // Expired or not found
    return NextResponse.json({ expired: true }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
