import { NextRequest } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";
import { proxyJson, upstreamFetch } from "@/lib/proxy";

type Params = { params: Promise<{ id: string; entryId: string }> };

// GET — a circle thread: the post that started it and the entries answering it
export async function GET(req: NextRequest, { params }: Params) {
  const { id, entryId } = await params;
  const token = await getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const page = req.nextUrl.searchParams.get("page");

  const res = await upstreamFetch(
    `${SERVER_API}/api/circles/${id}/threads/${entryId}${page ? `?page=${encodeURIComponent(page)}` : ""}`,
    { headers, cache: "no-store" },
  );
  return proxyJson(res);
}
