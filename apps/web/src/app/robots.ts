import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
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

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
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
      // Block AI training crawlers from all content
      ...aiCrawlers.map((agent) => ({
        userAgent: agent,
        disallow: ["/"],
      })),
    ],
    sitemap: "https://inkwell.social/sitemap.xml",
  };
}
