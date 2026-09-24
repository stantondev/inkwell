import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";
import { proxyJson, upstreamFetch } from "@/lib/proxy";

type Ctx = { params: Promise<{ id: string }> };

async function forward(req: NextRequest, { params }: Ctx, method: "PATCH" | "DELETE") {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { id } = await params;
  const res = await upstreamFetch(`${SERVER_API}/api/me/icons/${encodeURIComponent(id)}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: method === "PATCH" ? await req.text() : undefined,
    cache: "no-store",
  });
  return proxyJson(res);
}

export const PATCH = (req: NextRequest, ctx: Ctx) => forward(req, ctx, "PATCH");
export const DELETE = (req: NextRequest, ctx: Ctx) => forward(req, ctx, "DELETE");
