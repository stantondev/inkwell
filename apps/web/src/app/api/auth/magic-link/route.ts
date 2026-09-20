/**
 * POST /api/auth/magic-link  (Next.js route handler — unauthenticated proxy)
 *
 * Proxies the magic-link request to Phoenix server-side so the browser
 * never makes a cross-origin request (avoids CORS entirely).
 */
import { NextRequest, NextResponse } from "next/server";
import { SERVER_API } from "@/lib/api";
import { HANDOFF_COOKIE } from "@/lib/session";
import { ATTRIBUTION_COOKIE, readAttribution } from "@/lib/attribution";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // Where this visitor first arrived from; the API stores it only when this
    // request creates a new account. Never taken from the request body.
    const attribution = readAttribution(request);

    const res = await fetch(`${SERVER_API}/api/auth/magic-link`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For":
          request.headers.get("x-forwarded-for") ??
          request.headers.get("x-real-ip") ??
          "unknown",
        // Fly sets Fly-Client-IP to the actual connecting peer and it is not
        // client-controllable, unlike X-Forwarded-For (a forged XFF prepends,
        // so its first entry can be anything the caller wants). Forward it
        // under our own name so the API can rate-limit on a trustworthy client
        // identity. The API only honours this header when the request's own
        // immediate peer is internal, i.e. it really came from this proxy.
        "X-Inkwell-Client-IP":
          request.headers.get("fly-client-ip") ??
          request.headers.get("x-real-ip") ??
          "",
      },
      body: JSON.stringify({ ...body, attribution }),
      cache: "no-store",
    });

    const text = await res.text();
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: "Inkwell is briefly unavailable. Please try again in a moment." },
        { status: 503 }
      );
    }

    const response = NextResponse.json(data, { status: res.status });

    // Remember which browser asked for this link. If the link is opened in the
    // same browser, /api/auth/verify sees this cookie and skips the "enter the
    // code from your other screen" step, since nothing needs handing over.
    //
    // This lasts as long as the magic link itself (30 minutes). At 10 minutes
    // anyone who took longer than that to open their email — which is most
    // people — was asked for a code in the very browser that had just asked
    // for the link, and the screen showing that code was usually gone.
    if (res.ok && typeof data.login_session_id === "string") {
      response.cookies.set(HANDOFF_COOKIE, data.login_session_id, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 30 * 60,
        path: "/",
      });
    }

    // The account exists now (new or returning), so the attribution has done
    // its job. Don't keep it around.
    if (res.ok && attribution) response.cookies.delete(ATTRIBUTION_COOKIE);

    return response;
  } catch (err) {
    console.error("Proxy /api/auth/magic-link error:", err);
    return NextResponse.json(
      { error: "Could not reach the server. Please try again later." },
      { status: 502 }
    );
  }
}
