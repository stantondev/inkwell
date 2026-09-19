import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";
import { proxyJson, upstreamFetch } from "@/lib/proxy";

type Params = { params: Promise<{ discussionId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const { discussionId } = await params;
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const qs = request.nextUrl.searchParams.toString();
  const res = await upstreamFetch(`${SERVER_API}/api/circles/discussions/${discussionId}/responses?${qs}`, {
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  return proxyJson(res);
}

export async function POST(request: NextRequest, { params }: Params) {
  const { discussionId } = await params;
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const body = await request.json();
  const res = await upstreamFetch(`${SERVER_API}/api/circles/discussions/${discussionId}/responses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  return proxyJson(res);
}
