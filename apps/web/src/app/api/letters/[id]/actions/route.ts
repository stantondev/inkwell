import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";
import { proxyJson, upstreamFetch } from "@/lib/proxy";

// POST /api/letters/[id]/actions — { action: "archive" | "unarchive" | "mute" |
// "unmute" | "unread" | "delete" | "accept" | "decline" }, your own view only.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const res = await upstreamFetch(`${SERVER_API}/api/conversations/${encodeURIComponent(id)}/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: typeof body?.action === "string" ? body.action : "" }),
    cache: "no-store",
  });
  return proxyJson(res);
}
