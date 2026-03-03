"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { SETTINGS_SECTIONS } from "./settings-ledger-nav";
import type { SettingsSection } from "./settings-ledger-nav";

function findCurrentSection(pathname: string): { section: SettingsSection; label: string } | null {
  for (const section of SETTINGS_SECTIONS) {
    for (const item of section.items) {
      if (item.href === "/settings" ? pathname === "/settings" : pathname.startsWith(item.href)) {
        return { section, label: item.label };
      }
    }
  }
  return null;
}

export function SettingsMobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const prevPathname = useRef(pathname);

  // Close dropdown on navigation
  useEffect(() => {
    if (prevPathname.current !== pathname) {
      setOpen(false);
      prevPathname.current = pathname;
    }
  }, [pathname]);

  const current = findCurrentSection(pathname);
  const currentSectionTitle = current?.section.title ?? "Settings";
  const currentLabel = current?.label ?? "Settings";

  const isActive = (href: string) => {
    if (href === "/settings") return pathname === "/settings";
    return pathname.startsWith(href);
  };

  return (
    <div className="settings-ledger-mobile-header">
      {/* Current location breadcrumb + toggle */}
      <button
        className="settings-ledger-mobile-toggle"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label="Toggle settings navigation"
      >
        <div className="settings-ledger-mobile-breadcrumb">
          <span className="settings-ledger-mobile-section-name">{currentSectionTitle}</span>
          <span className="settings-ledger-mobile-separator">/</span>
          <span className="settings-ledger-mobile-page-name">{currentLabel}</span>
        </div>
        <svg
          width={16}
          height={16}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`settings-ledger-mobile-chevron ${open ? "settings-ledger-mobile-chevron--open" : ""}`}
          aria-hidden
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Accordion sections */}
      <div className={`settings-ledger-mobile-sections ${open ? "settings-ledger-mobile-sections--open" : ""}`}>
        {SETTINGS_SECTIONS.map((section) => (
          <div key={section.numeral} className="settings-ledger-mobile-group">
            <div className="settings-ledger-mobile-group-heading">
              <span className="settings-ledger-numeral">{section.numeral}.</span>
              <span>{section.title}</span>
            </div>
            <div className="settings-ledger-mobile-pills">
              {section.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`settings-ledger-mobile-pill ${active ? "settings-ledger-mobile-pill--active" : ""}`}
                    style={item.danger && !active ? { color: "var(--danger, #dc2626)", borderColor: "var(--danger, #dc2626)" } : undefined}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
