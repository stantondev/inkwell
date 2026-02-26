import { NextRequest, NextResponse } from "next/server";
import { SERVER_API } from "@/lib/api";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "token is required" }, { status: 400 });

  const res = await fetch(`${SERVER_API}/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`, {
    cache: "no-store",
  });
  const text = await res.text();
  try {
    const data = JSON.parse(text);
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Invalid unsubscribe link" }, { status: res.status || 500 });
  }
}
