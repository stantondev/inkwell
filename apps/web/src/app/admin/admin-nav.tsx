"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { label: "Dashboard", href: "/admin" },
  { label: "Users", href: "/admin/users" },
  { label: "Entries", href: "/admin/entries" },
  { label: "Reports", href: "/admin/reports" },
  { label: "Polls", href: "/admin/polls" },
];

export function AdminNav({ pendingReports }: { pendingReports?: number }) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 rounded-xl border p-1" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      {tabs.map((tab) => {
        const active = tab.href === "/admin" ? pathname === "/admin" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
            style={{
              background: active ? "var(--accent)" : "transparent",
              color: active ? "white" : "var(--muted)",
            }}
          >
            {tab.label}
            {tab.label === "Reports" && pendingReports != null && pendingReports > 0 && (
              <span
                className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-xs font-bold px-1"
                style={{
                  background: active ? "rgba(255,255,255,0.25)" : "var(--danger, #dc2626)",
                  color: active ? "white" : "white",
                }}
              >
                {pendingReports > 9 ? "9+" : pendingReports}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
