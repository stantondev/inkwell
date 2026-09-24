import { NextRequest } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";
import { proxyJson, upstreamFetch } from "@/lib/proxy";

type Params = { params: Promise<{ id: string }> };

// GET /api/circles/:id/entries?page=&prompt=&top_level=1&exclude= — entries posted to a circle
// (optional auth: members also see members-only posts)
export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const token = await getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const qs = new URLSearchParams();
  for (const key of ["page", "prompt", "top_level", "exclude"]) {
    const value = req.nextUrl.searchParams.get(key);
    if (value) qs.set(key, value);
  }

  const res = await upstreamFetch(`${SERVER_API}/api/circles/${id}/entries?${qs}`, { headers, cache: "no-store" });
  return proxyJson(res);
}
