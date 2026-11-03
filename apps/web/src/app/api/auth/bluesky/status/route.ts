import { SERVER_API } from "@/lib/api";
import { getToken } from "@/lib/session";
import { proxyJson, upstreamFetch } from "@/lib/proxy";

export async function GET() {
  const token = await getToken();
  const res = await upstreamFetch(`${SERVER_API}/api/auth/bluesky/status`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });
  return proxyJson(res);
}
