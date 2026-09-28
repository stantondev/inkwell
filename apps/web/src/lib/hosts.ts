import { getSite } from "@/lib/site";

/**
 * Hosts that are Inkwell itself rather than a writer's custom domain.
 *
 * Shared by the middleware (which rewrites custom-domain requests onto the
 * writer's profile) and by robots.ts / sitemap.ts, which have to serve a
 * different document depending on which of the two they are answering for.
 * Keeping one list means a host can never be "known" to one and a custom
 * domain to the other.
 *
 * This used to be inkwell.social's hosts only, so a self-hosted server at
 * any other domain took itself for an unconfigured custom domain and showed
 * "Domain Not Connected" on every page.
 */
const INKWELL_SOCIAL_HOSTS = ["inkwell.social", "www.inkwell.social", "inkwell-web.fly.dev"];

export function knownHosts(): Set<string> {
  const site = getSite();
  const hosts = [site.host, "localhost", "127.0.0.1"];
  if (!site.selfHosted) hosts.push(...INKWELL_SOCIAL_HOSTS);
  return new Set(hosts);
}

/** Strip the port and normalise case, the way middleware compares hosts. */
export function normalizeHost(host: string | null | undefined): string {
  return (host ?? "").replace(/:\d+$/, "").toLowerCase();
}

/**
 * True when this Host header belongs to a writer's custom domain. Never on a
 * self-hosted server: custom domains need inkwell.social's certificate
 * service, and there any address the operator points here is the site
 * (a LAN address, a second name).
 */
export function isCustomDomainHost(host: string | null | undefined): boolean {
  if (getSite().selfHosted) return false;
  const h = normalizeHost(host);
  return h.length > 0 && !knownHosts().has(h);
}
