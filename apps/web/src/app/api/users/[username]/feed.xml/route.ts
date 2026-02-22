import { NextRequest } from "next/server";
import { SERVER_API } from "@/lib/api";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;

  const res = await fetch(
    `${SERVER_API}/api/users/${encodeURIComponent(username)}/feed.xml`,
    { cache: "no-store" }
  );

  const body = await res.text();

  return new Response(body, {
    status: res.status,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
    },
  });
}
