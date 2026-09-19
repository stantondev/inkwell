import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";
import { proxyJson, upstreamFetch } from "@/lib/proxy";

export async function POST(request: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const body = await request.json();
    const res = await upstreamFetch(`${SERVER_API}/api/me/entries/bulk`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return proxyJson(res);
  } catch (err) {
    console.error("Proxy /api/me/entries/bulk error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
