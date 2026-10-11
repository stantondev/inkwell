import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";
import { proxyJson, upstreamFetch } from "@/lib/proxy";

// The parameters the drafts list understands; anything else is dropped.
const FORWARDED_PARAMS = ["page", "per_page", "q", "sort"];

export async function GET(request: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const incoming = new URL(request.url).searchParams;
  const params = new URLSearchParams();
  for (const key of FORWARDED_PARAMS) {
    const value = incoming.get(key);
    if (value) params.set(key, value);
  }
  const qs = params.toString();

  const res = await upstreamFetch(`${SERVER_API}/api/drafts${qs ? `?${qs}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  return proxyJson(res);
}
