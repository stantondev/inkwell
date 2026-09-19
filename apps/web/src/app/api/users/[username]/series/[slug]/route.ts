import { NextRequest } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";
import { proxyJson, upstreamFetch } from "@/lib/proxy";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string; slug: string }> }
) {
  const token = await getToken();
  const { username, slug } = await params;

  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await upstreamFetch(`${SERVER_API}/api/users/${username}/series/${slug}`, {
    headers,
    cache: "no-store",
  });
  return proxyJson(res);
}
