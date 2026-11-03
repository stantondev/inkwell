import { NextResponse } from "next/server";
import { SERVER_API } from "@/lib/api";
import { getToken } from "@/lib/session";
import { proxyJson, upstreamFetch } from "@/lib/proxy";

async function forward(method: "GET" | "DELETE") {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const res = await upstreamFetch(`${SERVER_API}/api/auth/bluesky/account`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  return proxyJson(res);
}

export const GET = () => forward("GET");
export const DELETE = () => forward("DELETE");
