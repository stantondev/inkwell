import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
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
    ],
    sitemap: "https://inkwell.social/sitemap.xml",
  };
}
