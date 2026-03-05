import type { MetadataRoute } from "next";
import { CATEGORIES } from "@/lib/categories";

const BASE = "https://inkwell.social";
const API = process.env.API_URL ?? "http://localhost:4000";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE, changeFrequency: "daily", priority: 1.0 },
    { url: `${BASE}/explore`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${BASE}/about`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/guide`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/guidelines`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE}/terms`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE}/privacy`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE}/brand`, changeFrequency: "monthly", priority: 0.2 },
    { url: `${BASE}/roadmap`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${BASE}/roadmap/releases`, changeFrequency: "weekly", priority: 0.4 },
    { url: `${BASE}/polls`, changeFrequency: "weekly", priority: 0.4 },
    { url: `${BASE}/developers`, changeFrequency: "monthly", priority: 0.4 },
  ];

  // Category pages
  const categoryPages: MetadataRoute.Sitemap = CATEGORIES.map((cat) => ({
    url: `${BASE}/category/${cat.value.replace(/_/g, "-")}`,
    changeFrequency: "daily" as const,
    priority: 0.6,
  }));

  // Dynamic data from API
  let users: { username: string; updated_at: string }[] = [];
  let entries: { username: string; slug: string; updated_at: string }[] = [];
  let tags: string[] = [];

  try {
    const res = await fetch(`${API}/api/sitemap-data`, {
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      const data = await res.json();
      users = data.users ?? [];
      entries = data.entries ?? [];
      tags = data.tags ?? [];
    }
  } catch {
    // Sitemap generation should not fail the build
  }

  const profilePages: MetadataRoute.Sitemap = users.map((u) => ({
    url: `${BASE}/${u.username}`,
    lastModified: u.updated_at,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  const entryPages: MetadataRoute.Sitemap = entries.map((e) => ({
    url: `${BASE}/${e.username}/${e.slug}`,
    lastModified: e.updated_at,
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));

  const tagPages: MetadataRoute.Sitemap = tags.map((t) => ({
    url: `${BASE}/tag/${encodeURIComponent(t)}`,
    changeFrequency: "daily" as const,
    priority: 0.5,
  }));

  return [
    ...staticPages,
    ...categoryPages,
    ...profilePages,
    ...entryPages,
    ...tagPages,
  ];
}
