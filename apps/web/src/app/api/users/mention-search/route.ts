import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";
import { proxyJson, upstreamFetch } from "@/lib/proxy";

export async function GET(req: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ data: [] });

  const q = req.nextUrl.searchParams.get("q") || "";
  const res = await upstreamFetch(`${SERVER_API}/api/users/mention-search?q=${encodeURIComponent(q)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  return proxyJson(res);
}
