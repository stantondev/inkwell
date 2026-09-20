/**
 * Header forwarding for the ActivityPub inbox proxies.
 *
 * Inbound federation traffic arrives at inkwell.social (the host our actor
 * documents advertise) and is proxied to the Phoenix API. HTTP Signatures are
 * computed over a set of headers the *sender* chooses, so the proxy must pass
 * every header through untouched — dropping one the sender signed makes the
 * signature unverifiable and the activity is rejected.
 *
 * Previously only `signature`, `date` and `digest` were forwarded, which broke
 * any sender that signed something else (`user-agent`, `content-digest`,
 * `signature-input`, …).
 */

/**
 * Hop-by-hop and connection-specific headers. These describe the single TCP
 * hop between the sender and Next.js, not the message, so forwarding them to
 * Phoenix is wrong (and `fetch` recomputes host/content-length itself).
 * Senders do not sign these.
 */
const HOP_BY_HOP = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "content-length",
  "expect",
  "accept-encoding",
]);

/**
 * Builds the headers to forward to the Phoenix API for an inbound activity.
 *
 * Node's `fetch()` overwrites `Host` with the target URL's hostname, so the
 * original is passed along as `x-original-host` — the signature verifier reads
 * that when rebuilding the signing string (Mastodon signs `host: inkwell.social`,
 * but we forward to api.inkwell.social).
 */
export function buildFederationHeaders(request: Request): Record<string, string> {
  const forwarded: Record<string, string> = {};

  request.headers.forEach((value, name) => {
    if (!HOP_BY_HOP.has(name.toLowerCase())) forwarded[name] = value;
  });

  if (!forwarded["content-type"]) {
    forwarded["content-type"] = "application/activity+json";
  }

  const originalHost = request.headers.get("host");
  if (originalHost) forwarded["x-original-host"] = originalHost;

  return forwarded;
}
