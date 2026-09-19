import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";
import { proxyJson, upstreamFetch } from "@/lib/proxy";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { id } = await params;

  try {
    const res = await upstreamFetch(`${SERVER_API}/api/remote-entries/${id}/ink`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    return proxyJson(res);
  } catch (err) {
    console.error("Proxy /api/remote-entries/:id/ink error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
