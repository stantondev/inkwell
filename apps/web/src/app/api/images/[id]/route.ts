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
  const buffer = await res.arrayBuffer();

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
