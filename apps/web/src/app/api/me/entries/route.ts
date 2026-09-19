import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";
import { proxyJson, upstreamFetch } from "@/lib/proxy";

export async function GET(request: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const qs = searchParams.toString();

  try {
    const res = await upstreamFetch(`${SERVER_API}/api/me/entries${qs ? `?${qs}` : ""}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    return proxyJson(res);
  } catch (err) {
    console.error("Proxy /api/me/entries error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
