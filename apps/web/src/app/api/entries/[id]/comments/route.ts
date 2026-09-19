import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";
import { proxyJson, upstreamFetch } from "@/lib/proxy";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const token = await getToken();

  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await upstreamFetch(`${SERVER_API}/api/entries/${id}/comments`, {
      headers,
      cache: "no-store",
    });
    return proxyJson(res);
  } catch (err) {
    console.error("Proxy GET /api/entries/:id/comments error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { id } = await params;

  try {
    const body = await request.json();
    const res = await upstreamFetch(`${SERVER_API}/api/entries/${id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    return proxyJson(res);
  } catch (err) {
    console.error("Proxy POST /api/entries/:id/comments error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
