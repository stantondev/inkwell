import { SERVER_API } from "@/lib/api";
import { proxyJson, upstreamFetch } from "@/lib/proxy";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  const res = await upstreamFetch(`${SERVER_API}/api/newsletter/${username}`, {
    cache: "no-store",
  });
  return proxyJson(res);
}
