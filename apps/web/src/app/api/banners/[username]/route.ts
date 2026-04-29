import { NextRequest, NextResponse } from "next/server";
import { SERVER_API } from "@/lib/api";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;

  const res = await fetch(`${SERVER_API}/api/banners/${encodeURIComponent(username)}`, {
    cache: "force-cache",
  });

  if (!res.ok) {
    return new NextResponse(null, { status: res.status });
  }

  const contentType = res.headers.get("content-type") || "image/jpeg";

  // Stream rather than buffer — banners can be larger than avatars (200KB-2MB).
  return new NextResponse(res.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400",
    },
  });
}
