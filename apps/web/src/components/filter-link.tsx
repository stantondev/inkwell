"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";

/**
 * A Link that forces a fresh server render on click.
 * Next.js's client-side router cache can serve stale content when navigating
 * between the same page with different search params (e.g., filter toggles).
 * This component intercepts the click, pushes the new URL, and refreshes
 * the server component tree to ensure fresh data.
 */
export function FilterLink({
  href,
  children,
  ...props
}: ComponentProps<typeof Link>) {
  const router = useRouter();

  return (
    <Link
      href={href}
      onClick={(e) => {
        e.preventDefault();
        router.push(href as string);
        router.refresh();
      }}
      {...props}
    >
      {children}
    </Link>
  );
}
