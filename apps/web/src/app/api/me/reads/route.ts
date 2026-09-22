import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { proxyJson, upstreamFetch } from "@/lib/proxy";

const SERVER_API = process.env.API_URL || "http://localhost:4000";

export async function GET(request: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const days = request.nextUrl.searchParams.get("days") ?? "30";
  const res = await upstreamFetch(`${SERVER_API}/api/me/reads?days=${encodeURIComponent(days)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  return proxyJson(res);
}
