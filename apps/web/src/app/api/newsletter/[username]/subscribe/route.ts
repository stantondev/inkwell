import { NextRequest, NextResponse } from "next/server";
import { SERVER_API } from "@/lib/api";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  const body = await req.json();
  const res = await fetch(`${SERVER_API}/api/newsletter/${username}/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
