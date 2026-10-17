import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";
import { proxyJson, upstreamFetch } from "@/lib/proxy";

// Give a pen pal a sticker for their page.
export async function POST(req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { username } = await params;
  const res = await upstreamFetch(`${SERVER_API}/api/users/${encodeURIComponent(username)}/sticker-gifts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: await req.text(),
    cache: "no-store",
  });
  return proxyJson(res);
}
