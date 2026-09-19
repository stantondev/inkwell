import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";
import { proxyJson, upstreamFetch } from "@/lib/proxy";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const body = await request.json();
    const res = await upstreamFetch(`${SERVER_API}/api/entries/${id}/stamp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    return proxyJson(res);
  } catch (err) {
    console.error("Proxy POST /api/entries/:id/stamp error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const res = await upstreamFetch(`${SERVER_API}/api/entries/${id}/stamp`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    return proxyJson(res);
  } catch (err) {
    console.error("Proxy DELETE /api/entries/:id/stamp error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
