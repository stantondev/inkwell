import { NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";
import { proxyJson, upstreamFetch } from "@/lib/proxy";

export async function GET() {
  const token = await getToken();

  try {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await upstreamFetch(`${SERVER_API}/api/gazette/topics`, {
      headers,
      cache: "no-store",
    });
    return proxyJson(res);
  } catch (err) {
    console.error("Proxy /api/gazette/topics error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
