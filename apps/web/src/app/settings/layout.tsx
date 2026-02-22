"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/settings", label: "Profile" },
  { href: "/settings/top-friends", label: "Top 6" },
  { href: "/settings/filters", label: "Filters" },
  { href: "/settings/billing", label: "Billing" },
  { href: "/settings/customize", label: "Customize" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-lg font-semibold mb-6">Settings</h1>

        <div className="flex gap-1 mb-8 border-b" style={{ borderColor: "var(--border)" }}>
          {tabs.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link key={tab.href} href={tab.href}
                className="px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors"
                style={{
                  borderColor: active ? "var(--accent)" : "transparent",
                  color: active ? "var(--accent)" : "var(--muted)",
                }}>
                {tab.label}
              </Link>
            );
          })}
        </div>

        {children}
      </div>
    </div>
  );
}
