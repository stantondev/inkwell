import { NextRequest } from "next/server";
import { getToken } from "@/lib/session";
import { proxyJson, upstreamFetch } from "@/lib/proxy";

const SERVER_API = process.env.API_URL || "http://localhost:4000";

// "Writers to meet" (Explore) and the empty Feed's suggestions. Works signed
// out; signed in, people you already follow are left out.
export async function GET(request: NextRequest) {
  const token = await getToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const limit = request.nextUrl.searchParams.get("limit");
  const qs = limit && /^\d{1,2}$/.test(limit) ? `?limit=${limit}` : "";
  const res = await upstreamFetch(`${SERVER_API}/api/explore/writers${qs}`, { headers, cache: "no-store" });
  return proxyJson(res);
}
