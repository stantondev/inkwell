import { NextRequest, NextResponse } from "next/server";
import { TOKEN_COOKIE, HANDOFF_COOKIE } from "@/lib/session";

const API_URL = process.env.API_URL ?? "http://localhost:4000";
const TOKEN_MAX_AGE = 60 * 60 * 24 * 90; // 90 days

/**
 * POST /api/auth/verify
 *
 * Verifies a magic link token against the Phoenix API.
 * Called from the client-side verify page (not directly from email links).
 * This is a POST to prevent email prefetchers from consuming one-time tokens.
 *
 * Responds with `handoff: true` when the link was requested somewhere else
 * (a different browser or the installed app). The verify page then offers to
 * sign that screen in too, but only after the person types the code shown
 * there — see Inkwell.Auth.LoginHandoff for why.
 */
export async function POST(request: NextRequest) {
  let body: { token?: string; lsid?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const token = body.token;
  const lsid = typeof body.lsid === "string" && body.lsid ? body.lsid : null;

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/auth/verify?token=${encodeURIComponent(token)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return NextResponse.json(
      { error: "Inkwell is briefly unavailable. Your link still works — try again in a moment.", retryable: true },
      { status: 503 }
    );
  }

  // Only a 4xx means the link itself is bad. A 502/503 during a deploy used to
  // be reported as "invalid or expired", sending people to request a new link
  // they didn't need.
  if (!res.ok) {
    if (res.status >= 500) {
      return NextResponse.json(
        { error: "Inkwell is briefly unavailable. Your link still works — try again in a moment.", retryable: true },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: "Invalid or expired sign-in link. Please request a new one." },
      { status: 401 }
    );
  }

  let data: { ok: boolean; token: string; user?: { settings?: { onboarded?: boolean } } };
  try {
    data = await res.json();
  } catch {
    return NextResponse.json(
      { error: "Inkwell is briefly unavailable. Please try again in a moment.", retryable: true },
      { status: 503 }
    );
  }

  const destination = data.user?.settings?.onboarded ? "/feed" : "/welcome";
  const sameBrowser = !!lsid && request.cookies.get(HANDOFF_COOKIE)?.value === lsid;
  const handoff = !!lsid && !sameBrowser;

  const response = NextResponse.json({ ok: true, destination, handoff });

  // Set the session cookie
  response.cookies.set(TOKEN_COOKIE, data.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: TOKEN_MAX_AGE,
    path: "/",
  });

  // Clear invite cookie after successful authentication
  response.cookies.set("inkwell_invite", "", {
    maxAge: 0,
    path: "/",
  });

  if (sameBrowser) {
    response.cookies.set(HANDOFF_COOKIE, "", { maxAge: 0, path: "/" });
  }

  return response;
}
