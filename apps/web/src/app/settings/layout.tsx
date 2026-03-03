"use client";

import { SettingsLedgerNav } from "./settings-ledger-nav";
import { SettingsMobileNav } from "./settings-mobile-nav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="settings-ledger" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <SettingsLedgerNav />
      <div className="settings-ledger-content">
        <SettingsMobileNav />
        {children}
      </div>
    </div>
  );
}
