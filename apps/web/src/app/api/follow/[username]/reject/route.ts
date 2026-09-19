import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";
import { proxyJson, upstreamFetch } from "@/lib/proxy";

type Params = { params: Promise<{ username: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { username } = await params;

  const res = await upstreamFetch(`${SERVER_API}/api/relationships/${username}/reject`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  return proxyJson(res);
}
