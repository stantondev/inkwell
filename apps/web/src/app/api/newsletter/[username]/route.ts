import { NextResponse } from "next/server";
import { SERVER_API } from "@/lib/api";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  const res = await fetch(`${SERVER_API}/api/newsletter/${username}`, {
    cache: "no-store",
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
