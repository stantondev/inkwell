import { NextRequest } from "next/server";
import { SERVER_API } from "@/lib/api";

// Per-tag RSS feed (linked from /tag/[tag]).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ tag: string }> }
) {
  const { tag } = await params;

  const res = await fetch(
    `${SERVER_API}/api/tags/${encodeURIComponent(tag)}/feed.xml`,
    { cache: "no-store" }
  );
  const body = await res.text();

  return new Response(body, {
    status: res.status,
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
