import { NextResponse } from "next/server";
import { TOKEN_COOKIE, getSession } from "@/lib/session";
import { safeReturnPath } from "@/lib/return-to";

/**
 * GET /auth/expired?next=/feed
 *
 * Where a signed-in-only page sends a visitor whose token cookie the API
 * rejected (see requireSession in lib/require-session.ts). Clears the dead
 * cookie and sends them to sign in, coming back to `next` afterwards.
 *
 * The token is checked again first, so a link to this URL can't sign anyone
 * out: a valid session goes straight on to `next`. If the API can't be
 * reached, nothing is cleared either; `next` shows the reconnecting screen.
 *
 * Relative Location headers, because behind Fly the request URL is the
 * internal address, not inkwell.social.
 */
export async function GET(request: Request) {
  const next = safeReturnPath(new URL(request.url).searchParams.get("next"));

  let signedIn: boolean;
  try {
    signedIn = (await getSession()) !== null;
  } catch {
    return go(next ?? "/feed");
  }
  if (signedIn) return go(next ?? "/feed");

  const response = go(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  response.cookies.set(TOKEN_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/",
  });
  return response;
}

function go(location: string): NextResponse {
  return new NextResponse(null, {
    status: 307,
    headers: { Location: location, "Cache-Control": "no-store" },
  });
}
