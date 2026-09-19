/**
 * GET /api/search  (Next.js route handler — proxy)
 *
 * Proxies search queries to Phoenix server-side to avoid CORS.
 */
import { NextRequest, NextResponse } from "next/server";
import { SERVER_API } from "@/lib/api";
import { proxyJson, upstreamFetch } from "@/lib/proxy";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const type = request.nextUrl.searchParams.get("type") ?? "users";

  try {
    const res = await upstreamFetch(
      `${SERVER_API}/api/search?q=${encodeURIComponent(q)}&type=${encodeURIComponent(type)}`,
      { cache: "no-store" }
    );
    return proxyJson(res);
  } catch (err) {
    console.error("Proxy /api/search error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
