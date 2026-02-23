"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { label: "Dashboard", href: "/admin" },
  { label: "Users", href: "/admin/users" },
  { label: "Entries", href: "/admin/entries" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 rounded-xl border p-1" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      {tabs.map((tab) => {
        const active = tab.href === "/admin" ? pathname === "/admin" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              background: active ? "var(--accent)" : "transparent",
              color: active ? "white" : "var(--muted)",
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
