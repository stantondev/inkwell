import { NextRequest } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";
import { proxyJson, upstreamFetch } from "@/lib/proxy";

export async function GET(request: NextRequest) {
  const token = await getToken();
  const params = request.nextUrl.searchParams.toString();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await upstreamFetch(`${SERVER_API}/api/polls/history?${params}`, {
    headers,
    cache: "no-store",
  });
  return proxyJson(res);
}
