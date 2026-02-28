import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";

export async function GET(req: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ data: [] });

  const q = req.nextUrl.searchParams.get("q") || "";
  const res = await fetch(`${SERVER_API}/api/users/mention-search?q=${encodeURIComponent(q)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
