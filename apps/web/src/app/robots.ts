import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { isCustomDomainHost, normalizeHost } from "@/lib/hosts";

// Must render per request: a writer's custom domain needs a robots.txt that
// points at its own sitemap, not inkwell.social's.
export const dynamic = "force-dynamic";

// Known AI training crawlers — block all
const aiCrawlers = [
  "GPTBot",
  "ChatGPT-User",
  "CCBot",
  "anthropic-ai",
  "ClaudeBot",
  "Claude-Web",
  "Google-Extended",
  "FacebookBot",
  "Bytespider",
  "cohere-ai",
  "Diffbot",
  "PerplexityBot",
  "YouBot",
  "Applebot-Extended",
  "Amazonbot",
  "Meta-ExternalAgent",
  "AI2Bot",
  "Scrapy",
  "Timpibot",
  "VelenPublicWebCrawler",
  "Omgilibot",
  "img2dataset",
  "PetalBot",
];

// Link previews (Facebook, X, LinkedIn, Slack, Discord…) check robots.txt
// before fetching a page's og:image. Every preview picture is served under
// /api/, so the blanket "Disallow: /api/" below hid them all and Facebook fell
// back to the first picture on the page: the Inkwell logo. These public image
// routes are allowed back in; the longer Allow wins over "Disallow: /api/".
const previewImagePaths = [
  "/api/og/",
  "/api/images/",
  "/api/avatars/",
  "/api/banners/",
  "/api/userpics/",
];

const aiRules = aiCrawlers.map((agent) => ({
  userAgent: agent,
  disallow: ["/"],
}));

export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = normalizeHost((await headers()).get("host"));

  // A writer's custom domain serves only their profile, entries and
  // subscribe page; every app route redirects to inkwell.social. It needs
  // its own sitemap reference, because a sitemap listing URLs on this host
  // is only honoured when this host's robots.txt points at it.
  if (isCustomDomainHost(host)) {
    return {
      rules: [
        {
          userAgent: "*",
          allow: ["/", ...previewImagePaths],
          disallow: ["/api/", "/auth/"],
        },
        ...aiRules,
      ],
      sitemap: `https://${host}/sitemap.xml`,
    };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", ...previewImagePaths],
        disallow: [
          "/admin",
          "/admin/*",
          "/settings",
          "/settings/*",
          "/editor",
          "/editor/*",
          "/drafts",
          "/feed",
          "/letters",
          "/letters/*",
          "/saved",
          "/notifications",
          "/notifications/*",
          "/welcome",
          "/pen-pals",
          "/api/",
          "/auth/",
          "/login",
          "/get-started",
        ],
      },
      ...aiRules,
    ],
    sitemap: "https://inkwell.social/sitemap.xml",
  };
}
