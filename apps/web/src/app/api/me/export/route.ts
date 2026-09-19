import { NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";
import { proxyJson, upstreamFetch } from "@/lib/proxy";

export async function GET() {
  const token = await getToken();
  if (!token)
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );

  const res = await upstreamFetch(`${SERVER_API}/api/me/export`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  return proxyJson(res);
}

export async function POST() {
  const token = await getToken();
  if (!token)
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );

  const res = await upstreamFetch(`${SERVER_API}/api/me/export`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
  return proxyJson(res);
}
