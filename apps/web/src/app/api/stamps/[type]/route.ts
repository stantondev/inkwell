import { NextRequest, NextResponse } from "next/server";
import { STAMP_CONFIG } from "@/components/stamp-config";
import { stampArtSvg } from "@/lib/stamp-art";
import { IMAGE_SECURITY_HEADERS } from "@/lib/image-headers";

/**
 * A stamp drawing as a file.
 *  - `/api/stamps/felt.svg`: what Inkwell's own pages show (StampArt). One
 *    cached file per design instead of ~4 KB of SVG inlined twice (HTML and
 *    RSC payload) for every stamp on every card.
 *  - `/api/stamps/felt` or `felt.png`: a 128 px PNG, for fediverse servers
 *    that show an Inkwell stamp as a custom emoji reaction.
 * Pages add `?v=STAMP_ART_VERSION`, so a redrawn stamp gets a new URL.
 */

type Sharp = typeof import("sharp");
let sharpPromise: Promise<Sharp | null> | null = null;
function loadSharp(): Promise<Sharp | null> {
  if (!sharpPromise) {
    sharpPromise = import("sharp")
      .then((m) => (m.default ?? m) as Sharp)
      .catch(() => null);
  }
  return sharpPromise;
}

const rendered = new Map<string, Buffer>();

export async function GET(_request: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const { type: raw } = await params;
  const svg = /\.svg$/i.test(raw);
  const type = raw.replace(/\.(png|svg)$/i, "");
  if (!/^[a-z0-9_]+$/.test(type) || type === "abroad" || !STAMP_CONFIG[type]) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (svg) {
    return new NextResponse(stampArtSvg(type), {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=31536000, immutable",
        ...IMAGE_SECURITY_HEADERS,
      },
    });
  }

  let png = rendered.get(type);
  if (!png) {
    const sharp = await loadSharp();
    if (!sharp) return NextResponse.json({ error: "Unavailable" }, { status: 503 });
    try {
      png = await sharp(Buffer.from(stampArtSvg(type)), { density: 288 })
        .resize({ width: 128 })
        .png({ compressionLevel: 9 })
        .toBuffer();
      rendered.set(type, png);
    } catch (err) {
      console.error("[stamps] render failed:", type, err);
      return NextResponse.json({ error: "Unavailable" }, { status: 503 });
    }
  }

  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
      ...IMAGE_SECURITY_HEADERS,
    },
  });
}
