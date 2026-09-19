import { SERVER_API } from "@/lib/api";
import { proxyJson, upstreamFetch } from "@/lib/proxy";

export async function GET() {
  const res = await upstreamFetch(`${SERVER_API}/api/push/vapid-key`, {
    cache: "no-store",
  });
  return proxyJson(res);
}
