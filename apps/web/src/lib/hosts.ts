/**
 * Hosts that are Inkwell itself rather than a writer's custom domain.
 *
 * Shared by the middleware (which rewrites custom-domain requests onto the
 * writer's profile) and by robots.ts / sitemap.ts, which have to serve a
 * different document depending on which of the two they are answering for.
 * Keeping one list means a host can never be "known" to one and a custom
 * domain to the other.
 */
export const KNOWN_HOSTS = new Set([
  "inkwell.social",
  "www.inkwell.social",
  "inkwell-web.fly.dev",
  "localhost",
  "127.0.0.1",
]);

/** Strip the port and normalise case, the way middleware compares hosts. */
export function normalizeHost(host: string | null | undefined): string {
  return (host ?? "").replace(/:\d+$/, "").toLowerCase();
}

/** True when this Host header belongs to a writer's custom domain. */
export function isCustomDomainHost(host: string | null | undefined): boolean {
  const h = normalizeHost(host);
  return h.length > 0 && !KNOWN_HOSTS.has(h);
}

/**
 * Writer subdomains (`alice.inkwell.social`) exist only to give writers who
 * share their journal on Bluesky an `@alice.inkwell.social` handle through
 * Bridgy Fed, which reads `/.well-known/atproto-did` on that host. Every other
 * request to one is sent to the writer's profile on inkwell.social, because the
 * session cookie is host-only and the site is not served twice.
 *
 * Returns the username label, or null. DNS labels can't hold underscores, so
 * usernames with one can't have a subdomain handle.
 */
const RESERVED_SUBDOMAINS = new Set(["www", "api", "post", "mail", "search"]);

export function writerSubdomain(host: string | null | undefined): string | null {
  const m = /^([a-z0-9]{3,30})\.inkwell\.social$/.exec(normalizeHost(host));
  if (!m || RESERVED_SUBDOMAINS.has(m[1])) return null;
  return m[1];
}
