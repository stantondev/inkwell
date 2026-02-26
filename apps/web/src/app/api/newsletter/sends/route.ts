import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";

export async function GET(req: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const qs = searchParams.toString();
  const res = await fetch(`${SERVER_API}/api/newsletter/sends${qs ? `?${qs}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
