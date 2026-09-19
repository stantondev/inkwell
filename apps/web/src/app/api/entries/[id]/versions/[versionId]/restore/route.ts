import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";
import { proxyJson, upstreamFetch } from "@/lib/proxy";

type Params = { params: Promise<{ id: string; versionId: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { id, versionId } = await params;

  try {
    const res = await upstreamFetch(`${SERVER_API}/api/entries/${id}/versions/${versionId}/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    return proxyJson(res);
  } catch (err) {
    console.error("Proxy /api/entries/:id/versions/:versionId/restore error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
