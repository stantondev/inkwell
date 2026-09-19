import { SERVER_API } from "@/lib/api";

// GET /api/healthcheck/api — "can the web tier reach the Phoenix API right now?"
//
// Polled by error.tsx's reconnecting screen after an outage (deploy restart,
// 502/503, timeout) so the page can reload itself once the API is back. Not a
// Fly health check: /api/healthcheck stays static on purpose so an API outage
// never marks the web machines unhealthy.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch(`${SERVER_API}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    return Response.json({ ok: res.ok }, { status: res.ok ? 200 : 503, headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
