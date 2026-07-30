/**
 * POST /api/auth/magic-link  (Next.js route handler — unauthenticated proxy)
 *
 * Proxies the magic-link request to Phoenix server-side so the browser
 * never makes a cross-origin request (avoids CORS entirely).
 */
import { NextRequest, NextResponse } from "next/server";
import { SERVER_API } from "@/lib/api";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

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
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("Proxy /api/auth/magic-link error:", err);
    return NextResponse.json(
      { error: "Could not reach the server. Please try again later." },
      { status: 502 }
    );
  }
}
