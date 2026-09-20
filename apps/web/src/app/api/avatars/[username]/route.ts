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

  const res = await fetch(`${SERVER_API}/api/avatars/${encodeURIComponent(username)}${suffix}`, {
    cache: "force-cache",
  });

  if (!res.ok) {
    return new NextResponse(null, { status: res.status });
  }

  const contentType = res.headers.get("content-type") || "image/jpeg";

  // Stream the body instead of buffering into Node's heap. Avatars decode to
  // 50-200KB JPEGs but cumulative buffering under load adds up; streaming
  // also lets the browser start rendering sooner.
  return new NextResponse(res.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      // 7 days fresh + 1 day stale-while-revalidate. Avatars rarely change;
      // when they do, the URL contains the username and the upstream ETag
      // still bypasses cache on `If-None-Match` revalidation.
      "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400",
    },
  });
}
