import { NextRequest, NextResponse } from "next/server";
import { SERVER_API } from "@/lib/api";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;

  // The `v` stamp (from the user's updated_at) is forwarded so a changed
  // image busts Next's data cache too — `force-cache` keys on the upstream
  // URL, so without it the old avatar would be served for the full week.
  const version = request.nextUrl.searchParams.get("v");
  const suffix = version ? `?v=${encodeURIComponent(version)}` : "";

  const res = await fetch(`${SERVER_API}/api/banners/${encodeURIComponent(username)}${suffix}`, {
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
