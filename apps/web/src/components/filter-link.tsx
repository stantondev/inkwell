import type { AnchorHTMLAttributes, ReactNode } from "react";

/**
 * A plain <a> tag for filter navigation on Explore.
 * Next.js <Link> uses client-side routing with an aggressive router cache
 * that serves stale server component output when navigating between the
 * same page with different search params. Plain <a> forces a full server
 * navigation, guaranteeing fresh content on every filter click.
 */
export function FilterLink({
  href,
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode }) {
  return (
    <a href={href} {...props}>
      {children}
    </a>
  );
}
