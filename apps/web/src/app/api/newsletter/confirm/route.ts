import { NextRequest, NextResponse } from "next/server";
import { SERVER_API } from "@/lib/api";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "token is required" }, { status: 400 });

  const res = await fetch(`${SERVER_API}/api/newsletter/confirm?token=${encodeURIComponent(token)}`, {
    cache: "no-store",
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
