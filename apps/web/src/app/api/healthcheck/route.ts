// Static health check — no API call, no DB, no SSR streaming.
//
// This is the target for Fly's health check (configured in fly.web.toml),
// replacing `/`. The landing page is a streaming SSR render that calls the
// API twice and is the most likely page to trigger the Node 20 TransformStream
// race condition (controller[kState].transformAlgorithm is not a function)
// when a downstream consumer disconnects mid-stream. A flat 200 OK from a
// route handler avoids all of that — Fly only needs to know the Next.js
// process is up and serving HTTP.
export const dynamic = "force-static";
export const revalidate = false;

export async function GET() {
  return new Response("ok", {
    status: 200,
    headers: {
      "content-type": "text/plain",
      "cache-control": "no-store",
    },
  });
}
