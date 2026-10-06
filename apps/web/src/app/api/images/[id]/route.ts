import { NextRequest, NextResponse } from "next/server";
import { SERVER_API } from "@/lib/api";
import { IMAGE_SECURITY_HEADERS } from "@/lib/image-headers";
import { toJpeg } from "@/lib/image-convert";

// Browsers that can show AVIF say so in their Accept header. Everything else
// (older browsers, email clients, fediverse servers, link previewers) gets
// the same picture as JPEG. Fediverse objects already label these images
// image/jpeg, so that's what those servers receive.
function acceptsAvif(request: NextRequest): boolean {
  return /\bimage\/avif\b/i.test(request.headers.get("accept") ?? "");
}

export async function GET(
  request: NextRequest,
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

  if (contentType.startsWith("image/avif")) {
    const headers = {
      "Cache-Control": "public, max-age=31536000, immutable",
      Vary: "Accept",
      ...IMAGE_SECURITY_HEADERS,
    };

    if (acceptsAvif(request)) {
      return new NextResponse(res.body, { status: 200, headers: { "Content-Type": "image/avif", ...headers } });
    }

    const jpeg = await toJpeg(Buffer.from(await res.arrayBuffer()), id);
    if (jpeg) {
      return new NextResponse(new Uint8Array(jpeg), { status: 200, headers: { "Content-Type": "image/jpeg", ...headers } });
    }
    // Conversion failed (logged in toJpeg). A client that can't show AVIF
    // couldn't use it anyway; a 503 lets it try again later.
    return NextResponse.json({ error: "Image could not be converted" }, { status: 503 });
  }

  // Stream rather than buffer — entry images can be up to ~5MB cover photos.
  // Cache headers stay aggressive (1 year, immutable) — entry images are
  // content-addressed by ID and don't change.
  return new NextResponse(res.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      ...IMAGE_SECURITY_HEADERS,
    },
  });
}
