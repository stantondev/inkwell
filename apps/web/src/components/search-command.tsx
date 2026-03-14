"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

/**
 * Global Cmd/Ctrl+K search shortcut.
 * If on /search, focuses the input. Otherwise navigates to /search.
 * Mount once in AppShell for logged-in users.
 */
export function SearchCommand() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (pathname === "/search") {
          window.dispatchEvent(new CustomEvent("inkwell-search-focus"));
        } else {
          router.push("/search");
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pathname, router]);

  return null;
}
