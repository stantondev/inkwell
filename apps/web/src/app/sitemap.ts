import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { CATEGORIES } from "@/lib/categories";
import { isCustomDomainHost, normalizeHost } from "@/lib/hosts";
import { getSite } from "@/lib/site";

// Generated per request, never at build time.
//
// This route used to be statically prerendered during `next build`, where
// API_URL does not exist (fly.web.toml sets it under [env], i.e. runtime
// only, and the Dockerfile receives just NEXT_PUBLIC_API_URL as a build
// arg). SERVER_API fell back to http://localhost:4000, the fetch was
// refused, and the catch below silently baked an empty sitemap into the
// image — so every profile, entry and tag was missing from it. The fetch
// still uses the data cache, so crawlers can't stampede the API.
export const dynamic = "force-dynamic";

const API = process.env.API_URL ?? "http://localhost:4000";

type SitemapUser = { username: string; updated_at: string; custom_domain?: string | null };
type SitemapEntry = { username: string; slug: string; updated_at: string; custom_domain?: string | null };
// `categories` lists topics with at least one Inkwell entry; null when the
// API predates it, in which case every topic is listed as before.
type SitemapData = { users: SitemapUser[]; entries: SitemapEntry[]; tags: string[]; categories: string[] | null };

async function fetchSitemapData(): Promise<SitemapData> {
  try {
    const res = await fetch(`${API}/api/sitemap-data`, {
      next: { revalidate: 900 },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`[sitemap] ${API}/api/sitemap-data responded ${res.status} — serving static pages only`);
      return { users: [], entries: [], tags: [], categories: null };
    }
    const data = await res.json();
    return {
      users: data.users ?? [],
      entries: data.entries ?? [],
      tags: data.tags ?? [],
      categories: Array.isArray(data.categories) ? data.categories : null,
    };
  } catch (err) {
    // Never fail the sitemap outright, but never fail silently either —
    // a quietly truncated sitemap is indistinguishable from a healthy one.
    console.error("[sitemap] could not reach the API — serving static pages only:", err);
    return { users: [], entries: [], tags: [], categories: null };
  }
}

/**
 * A writer on a custom domain gets their own sitemap, on their own domain.
 *
 * Their canonical URLs all point at the custom domain, and a sitemap may
 * only list URLs on the host that serves it — cross-domain entries in
 * inkwell.social's sitemap are ignored unless the other domain's robots.txt
 * cross-submits them. So the custom domain self-hosts, and inkwell.social's
 * sitemap leaves those writers out entirely (see mainSitemap).
 */
function customDomainSitemap(host: string, data: SitemapData): MetadataRoute.Sitemap {
  const root = `https://${host}`;
  const owner = data.users.find((u) => normalizeHost(u.custom_domain) === host);
  const entries = data.entries.filter((e) => normalizeHost(e.custom_domain) === host);

  if (!owner && entries.length === 0) return [];

  return [
    {
      url: root,
      lastModified: owner?.updated_at,
      changeFrequency: "weekly" as const,
      priority: 1.0,
    },
    ...entries.map((e) => ({
      url: `${root}/${e.slug}`,
      lastModified: e.updated_at,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}

// Pages about inkwell.social itself (its costs, trademark, marketing), which a
// self-hosted server doesn't serve.
const INKWELL_SOCIAL_ONLY = ["/for-writers", "/switch", "/transparency", "/brand"];

function mainSitemap(data: SitemapData): MetadataRoute.Sitemap {
  const now = new Date().toISOString();
  const site = getSite();
  const BASE = site.url;

  const allStaticPages: MetadataRoute.Sitemap = [
    { url: BASE, changeFrequency: "daily", priority: 1.0, lastModified: now },
    { url: `${BASE}/explore`, changeFrequency: "hourly", priority: 0.9, lastModified: now },
    { url: `${BASE}/gazette`, changeFrequency: "daily", priority: 0.7, lastModified: now },
    { url: `${BASE}/for-writers`, changeFrequency: "monthly", priority: 0.8, lastModified: "2026-09-17" },
    { url: `${BASE}/switch`, changeFrequency: "monthly", priority: 0.6, lastModified: "2026-09-17" },
    { url: `${BASE}/switch/wordpress`, changeFrequency: "monthly", priority: 0.6, lastModified: "2026-09-17" },
    { url: `${BASE}/switch/substack`, changeFrequency: "monthly", priority: 0.6, lastModified: "2026-09-17" },
    { url: `${BASE}/switch/medium`, changeFrequency: "monthly", priority: 0.6, lastModified: "2026-09-17" },
    { url: `${BASE}/switch/livejournal`, changeFrequency: "monthly", priority: 0.6, lastModified: "2026-09-22" },
    { url: `${BASE}/switch/dreamwidth`, changeFrequency: "monthly", priority: 0.6, lastModified: "2026-09-22" },
    { url: `${BASE}/about`, changeFrequency: "monthly", priority: 0.5, lastModified: "2026-03-01" },
    { url: `${BASE}/guide`, changeFrequency: "monthly", priority: 0.5, lastModified: "2026-03-01" },
    { url: `${BASE}/help`, changeFrequency: "monthly", priority: 0.5, lastModified: "2026-03-30" },
    { url: `${BASE}/help/faq`, changeFrequency: "monthly", priority: 0.5, lastModified: "2026-03-30" },
    { url: `${BASE}/help/getting-started`, changeFrequency: "monthly", priority: 0.5, lastModified: "2026-03-30" },
    { url: `${BASE}/help/status`, changeFrequency: "weekly", priority: 0.2, lastModified: "2026-03-30" },
    { url: `${BASE}/circles`, changeFrequency: "daily", priority: 0.6, lastModified: now },
    { url: `${BASE}/transparency`, changeFrequency: "weekly", priority: 0.5, lastModified: now },
    { url: `${BASE}/open-source`, changeFrequency: "monthly", priority: 0.4, lastModified: "2026-09-17" },
    { url: `${BASE}/ai`, changeFrequency: "monthly", priority: 0.4, lastModified: "2026-05-01" },
    { url: `${BASE}/roadmap`, changeFrequency: "weekly", priority: 0.5, lastModified: now },
    { url: `${BASE}/roadmap/releases`, changeFrequency: "weekly", priority: 0.4, lastModified: now },
    { url: `${BASE}/polls`, changeFrequency: "weekly", priority: 0.4, lastModified: now },
    { url: `${BASE}/polls/history`, changeFrequency: "weekly", priority: 0.3, lastModified: now },
    { url: `${BASE}/developers`, changeFrequency: "monthly", priority: 0.4, lastModified: "2026-02-28" },
    { url: `${BASE}/guidelines`, changeFrequency: "monthly", priority: 0.3, lastModified: "2026-02-27" },
    { url: `${BASE}/terms`, changeFrequency: "monthly", priority: 0.3, lastModified: "2026-02-27" },
    { url: `${BASE}/privacy`, changeFrequency: "monthly", priority: 0.3, lastModified: "2026-02-27" },
    { url: `${BASE}/brand`, changeFrequency: "monthly", priority: 0.2, lastModified: "2026-02-27" },
  ];
  const staticPages = site.selfHosted
    ? allStaticPages.filter((p) => !INKWELL_SOCIAL_ONLY.some((path) => p.url === BASE + path || p.url.startsWith(`${BASE}${path}/`)))
    : allStaticPages;

  // A topic page with no Inkwell entries opens on its fediverse view, which
  // is noindex, so only topics Inkwell writers have used are listed.
  const listedCategories = data.categories
    ? CATEGORIES.filter((cat) => data.categories!.includes(cat.value))
    : CATEGORIES;
  const categoryPages: MetadataRoute.Sitemap = listedCategories.map((cat) => ({
    url: `${BASE}/category/${cat.value.replace(/_/g, "-")}`,
    changeFrequency: "daily" as const,
    priority: 0.6,
  }));

  // Writers on a custom domain are canonical there, so they are listed in
  // their own domain's sitemap instead of here.
  const profilePages: MetadataRoute.Sitemap = data.users
    .filter((u) => !u.custom_domain)
    .map((u) => ({
      url: `${BASE}/${u.username}`,
      lastModified: u.updated_at,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

  const entryPages: MetadataRoute.Sitemap = data.entries
    .filter((e) => !e.custom_domain)
    .map((e) => ({
      url: `${BASE}/${e.username}/${e.slug}`,
      lastModified: e.updated_at,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    }));

  const tagPages: MetadataRoute.Sitemap = data.tags.map((t) => ({
    url: `${BASE}/tag/${encodeURIComponent(t)}`,
    changeFrequency: "daily" as const,
    priority: 0.5,
  }));

  return [...staticPages, ...categoryPages, ...profilePages, ...entryPages, ...tagPages];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = normalizeHost((await headers()).get("host"));
  const data = await fetchSitemapData();

  return isCustomDomainHost(host) ? customDomainSitemap(host, data) : mainSitemap(data);
}
