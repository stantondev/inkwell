import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";
import { proxyJson, upstreamFetch } from "@/lib/proxy";

// GET /api/me/entries/export — the Posts table as a spreadsheet (CSV), with
// the page's filters.
export async function GET(request: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const res = await upstreamFetch(`${SERVER_API}/api/me/entries/export?${request.nextUrl.searchParams}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  const contentType = res.headers.get("content-type") ?? "";
  if (!res.ok || !contentType.startsWith("text/csv")) return proxyJson(res);

  return new NextResponse(res.body, {
    status: 200,
    headers: {
      "content-type": contentType,
      "content-disposition": res.headers.get("content-disposition") ?? 'attachment; filename="inkwell-posts.csv"',
      "cache-control": "private, no-store",
    },
  });
}
