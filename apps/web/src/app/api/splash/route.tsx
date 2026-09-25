import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { PenNibIcon, ogFonts } from "../og/og-shared";
import { SPLASH_SIZES } from "@/lib/splash-screens";

/**
 * Launch screen for the installed app on iPhone/iPad (apple-touch-startup-
 * image). iOS wants one image per screen size, so they're drawn on request
 * instead of shipping dozens of PNGs. Only the sizes in SPLASH_SIZES are
 * drawn; they never change, so they're cached for a year.
 */
export async function GET(req: NextRequest) {
  const w = Number(req.nextUrl.searchParams.get("w"));
  const h = Number(req.nextUrl.searchParams.get("h"));
  const dark = req.nextUrl.searchParams.get("dark") === "1";
  const known = SPLASH_SIZES.some((s) => s.w * s.dpr === w && s.h * s.dpr === h);
  if (!known) return new Response("Unknown size", { status: 404 });

  const bg = dark ? "#0c0a09" : "#fafaf9";
  const ink = dark ? "#93b4f0" : "#2d4a8a";
  const text = dark ? "#e7e5e4" : "#1c1917";
  const unit = Math.min(w, h);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: bg,
          gap: Math.round(unit * 0.04),
        }}
      >
        <PenNibIcon size={Math.round(unit * 0.22)} color={ink} />
        <div style={{ fontFamily: "Lora", fontWeight: 700, fontSize: Math.round(unit * 0.09), color: text }}>
          Inkwell
        </div>
      </div>
    ),
    {
      width: w,
      height: h,
      fonts: await ogFonts(),
      headers: { "Cache-Control": "public, max-age=31536000, immutable" },
    }
  );
}
