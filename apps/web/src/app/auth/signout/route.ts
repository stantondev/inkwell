import { NextRequest, NextResponse } from "next/server";
import { TOKEN_COOKIE, getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";

/**
 * POST /auth/signout
 *
 * Revokes the API session token on the Phoenix backend,
 * clears the httpOnly cookie, and redirects to the homepage.
 */
export async function POST(request: NextRequest) {
  const host = request.headers.get("host") ?? request.nextUrl.host;
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const origin = `${proto}://${host}`;

  const token = await getToken();

  // Tell Phoenix to revoke the token
  if (token) {
    try {
      await fetch(`${SERVER_API}/api/auth/session`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
    } catch {
      // Best-effort — still clear cookie even if API is down
    }
  }

  const response = NextResponse.redirect(new URL("/", origin), {
    status: 303, // See Other — prevents browser re-POST on back button
  });

  // Clear the auth cookie
  response.cookies.set(TOKEN_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });

  return response;
}
