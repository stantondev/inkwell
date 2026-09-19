import { SERVER_API } from "@/lib/api";

// Site-wide RSS feed, advertised in every page's <head>. It had no route on
// inkwell.social, so feed readers got a 404.
export async function GET() {
  const res = await fetch(`${SERVER_API}/api/explore/feed.xml`, { cache: "no-store" });
  const body = await res.text();

  return new Response(body, {
    status: res.status,
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
