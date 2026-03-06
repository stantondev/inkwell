import { NextRequest, NextResponse } from "next/server";
import { SERVER_API } from "@/lib/api";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;

  const res = await fetch(`${SERVER_API}/api/avatars/${encodeURIComponent(username)}`, {
    cache: "force-cache",
  });

  if (!res.ok) {
    return new NextResponse(null, { status: res.status });
  }

  const contentType = res.headers.get("content-type") || "image/jpeg";
  const buffer = await res.arrayBuffer();

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
