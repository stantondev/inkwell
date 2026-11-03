import { NextResponse } from "next/server";
import { SERVER_API } from "@/lib/api";
import { upstreamFetch } from "@/lib/proxy";

// Our Bluesky OAuth client_id is this URL. Bluesky fetches it to learn our
// redirect address and public key, and requires a plain 200 JSON answer
// (no redirect), so it is served here on the site's own address.
export const dynamic = "force-dynamic";

export async function GET() {
  const res = await upstreamFetch(`${SERVER_API}/api/auth/bluesky/client-metadata`, { cache: "no-store" });
  if (!res.ok) return NextResponse.json({ error: "not_configured" }, { status: 404 });

  const body = await res.json();
  return NextResponse.json(body, {
    status: 200,
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
