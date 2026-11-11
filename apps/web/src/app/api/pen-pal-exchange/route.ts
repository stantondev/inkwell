import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";
import { proxyJson, upstreamFetch } from "@/lib/proxy";

const URL = `${SERVER_API}/api/pen-pal-exchange`;

async function forward(method: "GET" | "POST" | "DELETE", body?: unknown) {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const res = await upstreamFetch(URL, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  return proxyJson(res);
}

export async function GET() {
  return forward("GET");
}

export async function POST(req: NextRequest) {
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    // no body is fine: the line about yourself is optional
  }
  return forward("POST", body);
}

export async function DELETE() {
  return forward("DELETE");
}
