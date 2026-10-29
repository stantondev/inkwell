import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";
import { proxyJson, upstreamFetch } from "@/lib/proxy";

// Saves the fediverse post a mention notification is about, so it can be
// answered with a footnote. Returns { data: { remote_entry_id } }.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { id } = await params;
  const res = await upstreamFetch(`${SERVER_API}/api/notifications/${encodeURIComponent(id)}/reply`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  return proxyJson(res);
}
