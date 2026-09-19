import { NextResponse } from "next/server";

/**
 * Helpers for the same-origin proxy routes under app/api/ that forward to the
 * Phoenix API.
 *
 * The API runs on a single machine, so during a deploy or restart Fly answers
 * with an HTML 502/503 page, and locally a stopped API refuses the connection.
 * A bare `await res.json()` throws on either, the route crashes with a generic
 * 500, and the page then reports the wrong thing ("not found", "signed out",
 * "you're on the free plan"). These keep the outage visible as a 503 with a
 * JSON body the client can show.
 */

export const UNAVAILABLE_MESSAGE =
  "Inkwell is briefly unavailable. Please try again in a moment.";

const NULL_BODY_STATUSES = new Set([204, 205, 304]);

/**
 * `fetch` that never rejects: a refused connection, DNS failure or timeout
 * comes back as a bodiless 503 Response, which `proxyJson` turns into the
 * "briefly unavailable" JSON. Everything else behaves exactly like `fetch`.
 */
export async function upstreamFetch(
  input: string | URL,
  init?: RequestInit
): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (err) {
    console.error(`Upstream fetch failed: ${String(input)}`, err);
    return new Response(null, { status: 503, statusText: "Upstream unavailable" });
  }
}

/**
 * Relay an upstream API response to the browser.
 *
 * - JSON body: passed through with the upstream status (same as the old
 *   `NextResponse.json(await res.json(), { status: res.status })`).
 * - 204/205/304, or an empty body on a non-5xx: passed through with no body.
 * - Anything else that isn't JSON (Fly's HTML error page, a refused
 *   connection): `{ error }` with 503, or with the upstream status if it was
 *   a 4xx, so a real client error isn't reported as an outage.
 */
export async function proxyJson(res: Response): Promise<NextResponse> {
  if (NULL_BODY_STATUSES.has(res.status)) {
    return new NextResponse(null, { status: res.status });
  }

  let text: string;
  try {
    text = await res.text();
  } catch {
    return unavailable();
  }

  if (text.trim() === "" && res.status < 500) {
    return new NextResponse(null, { status: res.status });
  }

  try {
    return NextResponse.json(JSON.parse(text), { status: res.status });
  } catch {
    if (res.status >= 400 && res.status < 500) {
      return NextResponse.json(
        { error: "Unexpected response from Inkwell" },
        { status: res.status }
      );
    }
    return unavailable();
  }
}

export function unavailable(): NextResponse {
  return NextResponse.json({ error: UNAVAILABLE_MESSAGE }, { status: 503 });
}
