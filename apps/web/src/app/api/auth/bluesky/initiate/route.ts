import { NextRequest, NextResponse } from "next/server";
import { SERVER_API } from "@/lib/api";
import { proxyJson, upstreamFetch } from "@/lib/proxy";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const res = await upstreamFetch(`${SERVER_API}/api/auth/bluesky/initiate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown",
        // See api/auth/magic-link: the API rate-limits on this when it came from us.
        "X-Inkwell-Client-IP": request.headers.get("fly-client-ip") ?? request.headers.get("x-real-ip") ?? "",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    return proxyJson(res);
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
