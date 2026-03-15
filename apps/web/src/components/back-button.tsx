"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

const TOP_LEVEL_PATHS = new Set(["/", "/feed", "/explore", "/editor", "/notifications", "/letters"]);

function getFallbackRoute(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);

  // /admin/* → /admin
  if (segments[0] === "admin") return "/admin";
  // /settings/* → /settings
  if (segments[0] === "settings") return "/settings";
  // /circles/:slug/:discussionId → /circles/:slug
  if (segments[0] === "circles" && segments.length >= 3) return `/circles/${segments[1]}`;
  // /circles/:slug → /circles
  if (segments[0] === "circles" && segments.length === 2) return "/circles";
  // /polls/:id → /polls
  if (segments[0] === "polls" && segments.length >= 2) return "/polls";
  // /roadmap/:id or /roadmap/* → /roadmap
  if (segments[0] === "roadmap" && segments.length >= 2) return "/roadmap";
  // /:username/:slug (entry detail) → /feed
  if (segments.length === 2) return "/feed";
  // /:username (profile) → /explore
  if (segments.length === 1) return "/explore";

  return "/feed";
}

export function BackButton() {
  const pathname = usePathname();
  const router = useRouter();
  const navDepth = useRef(0);
  const initialPath = useRef(pathname);

  useEffect(() => {
    if (pathname !== initialPath.current) {
      navDepth.current++;
    }
  }, [pathname]);

  // Hide on top-level tab destinations
  if (TOP_LEVEL_PATHS.has(pathname)) return null;

  const handleBack = () => {
    if (navDepth.current > 0) {
      router.back();
    } else {
      router.push(getFallbackRoute(pathname));
    }
  };

  return (
    <button
      className="back-button"
      onClick={handleBack}
      aria-label="Go back"
      type="button"
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="15 18 9 12 15 6" />
      </svg>
    </button>
  );
}
