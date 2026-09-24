import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";
import { proxyJson, upstreamFetch } from "@/lib/proxy";

type Params = { params: Promise<{ id: string }> };

async function forward(method: "POST" | "DELETE", id: string, body?: string) {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const res = await upstreamFetch(`${SERVER_API}/api/circles/${id}/prompt`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body,
    cache: "no-store",
  });
  return proxyJson(res);
}

// POST {entry_id} — pin an entry as the circle's prompt
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  return forward("POST", id, await req.text());
}

// DELETE — clear the prompt
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  return forward("DELETE", id);
}
