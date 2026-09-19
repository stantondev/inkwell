import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { proxyJson, upstreamFetch } from "@/lib/proxy";

const SERVER_API = process.env.API_URL || "http://localhost:4000";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = await getToken();
  if (!token)
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );

  try {
    const body = await request.json();
    const res = await upstreamFetch(`${SERVER_API}/api/entries/${id}/reprint`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    return proxyJson(res);
  } catch (err) {
    console.error("Proxy POST /api/entries/:id/reprint error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
