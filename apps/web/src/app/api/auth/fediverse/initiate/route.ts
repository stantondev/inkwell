import { NextRequest, NextResponse } from "next/server";
import { SERVER_API } from "@/lib/api";
import { proxyJson, upstreamFetch } from "@/lib/proxy";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const res = await upstreamFetch(`${SERVER_API}/api/auth/fediverse/initiate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For":
          request.headers.get("x-forwarded-for") ??
          request.headers.get("x-real-ip") ??
          "unknown",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    return proxyJson(res);
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
