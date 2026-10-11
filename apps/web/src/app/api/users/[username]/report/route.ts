import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";
import { proxyJson, upstreamFetch } from "@/lib/proxy";

// Report an account as a whole (profile, requests, letters).
export async function POST(req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { username } = await params;

  const body = await req.json().catch(() => ({}));
  const res = await upstreamFetch(`${SERVER_API}/api/users/${encodeURIComponent(username)}/report`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return proxyJson(res);
}
