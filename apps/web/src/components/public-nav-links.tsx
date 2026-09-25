"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Links for signed-out visitors. Most arrive on a single entry from search or
// a shared link; until 2026-09-25 the bar held only Sign in / Get started, so
// the only way to see more of Inkwell was the footer.

const LINKS = [
  { href: "/explore", label: "Explore" },
  { href: "/gazette", label: "Gazette" },
  { href: "/about", label: "About" },
];

export function PublicNavLinks() {
  const pathname = usePathname();
  return (
    <div className="public-nav-links">
      {LINKS.map((l) => {
        const active = pathname === l.href || pathname.startsWith(l.href + "/");
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`public-nav-link${active ? " public-nav-link--active" : ""}${l.href === "/explore" ? " public-nav-link--keep" : ""}`}
            aria-current={active ? "page" : undefined}
            title={l.label}
          >
            {l.href === "/explore" && (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="public-nav-link-icon">
                <circle cx="12" cy="12" r="10" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
              </svg>
            )}
            {l.label}
          </Link>
        );
      })}
    </div>
  );
}
