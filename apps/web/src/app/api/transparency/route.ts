import { NextResponse } from "next/server";
import { SERVER_API } from "@/lib/api";

export async function GET() {
  const res = await fetch(`${SERVER_API}/api/transparency`, {
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!res) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  const text = await res.text();
  try {
    return NextResponse.json(JSON.parse(text), { status: res.status });
  } catch {
    return NextResponse.json({ error: "Unexpected server response" }, { status: 502 });
  }
}
