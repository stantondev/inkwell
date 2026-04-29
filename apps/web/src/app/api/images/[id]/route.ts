import { NextRequest, NextResponse } from "next/server";
import { SERVER_API } from "@/lib/api";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const res = await fetch(`${SERVER_API}/api/images/${id}`, {
    cache: "force-cache",
  });

  if (!res.ok) {
    return NextResponse.json({ error: "Image not found" }, { status: res.status });
  }

  const contentType = res.headers.get("content-type") || "image/jpeg";

  // Stream rather than buffer — entry images can be up to ~5MB cover photos.
  // Cache headers stay aggressive (1 year, immutable) — entry images are
  // content-addressed by ID and don't change.
  return new NextResponse(res.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
