/**
 * GET /api/search/fediverse  (Next.js route handler — proxy)
 *
 * Proxies fediverse search to Phoenix server-side to avoid CORS.
 */
import { NextRequest, NextResponse } from "next/server";
import { SERVER_API } from "@/lib/api";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";

  try {
    const res = await fetch(
      `${SERVER_API}/api/search/fediverse?q=${encodeURIComponent(q)}`,
      { cache: "no-store" }
    );
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("Proxy /api/search/fediverse error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
