"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// ─── Icons (16x16, same pattern as sidebar-nav.tsx) ───

const iconProps = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
};

function ProfileIcon() { return <svg {...iconProps}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>; }
function AvatarIcon() { return <svg {...iconProps}><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>; }
function PeopleIcon() { return <svg {...iconProps}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>; }
function PaletteIcon() { return <svg {...iconProps}><circle cx="13.5" cy="6.5" r="0.5" fill="currentColor" stroke="none" /><circle cx="17.5" cy="10.5" r="0.5" fill="currentColor" stroke="none" /><circle cx="8.5" cy="7.5" r="0.5" fill="currentColor" stroke="none" /><circle cx="6.5" cy="12.5" r="0.5" fill="currentColor" stroke="none" /><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" /></svg>; }
function PinIcon() { return <svg {...iconProps}><path d="M9 4v6l-2 4v2h10v-2l-2-4V4" /><line x1="12" y1="16" x2="12" y2="21" /><line x1="8" y1="4" x2="16" y2="4" /></svg>; }
function BookIcon() { return <svg {...iconProps}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>; }
function FilterIcon() { return <svg {...iconProps}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>; }
function BarChartIcon() { return <svg {...iconProps}><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>; }
function ImportIcon() { return <svg {...iconProps}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>; }
function RedactIcon() { return <svg {...iconProps}><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>; }
function ShieldIcon() { return <svg {...iconProps}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>; }
function BellIcon() { return <svg {...iconProps}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>; }
function SendMailIcon() { return <svg {...iconProps}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /><line x1="10" y1="14" x2="21" y2="3" /></svg>; }
function MailIcon() { return <svg {...iconProps}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>; }
function InviteIcon() { return <svg {...iconProps}><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>; }
function BlockIcon() { return <svg {...iconProps}><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>; }
function GlobeIcon() { return <svg {...iconProps}><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>; }
function LinkIcon() { return <svg {...iconProps}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>; }
function StarIcon() { return <svg {...iconProps}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>; }
function HeartIcon() { return <svg {...iconProps}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>; }
function DollarIcon() { return <svg {...iconProps}><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>; }
function KeyIcon() { return <svg {...iconProps}><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" /></svg>; }
function DownloadIcon() { return <svg {...iconProps}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>; }
function TrashIcon() { return <svg {...iconProps}><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>; }

// ─── Section Config ───

interface SettingsItem {
  href: string;
  label: string;
  icon: () => React.JSX.Element;
  danger?: boolean;
}

interface SettingsSection {
  numeral: string;
  title: string;
  items: SettingsItem[];
}

const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    numeral: "I",
    title: "Profile & Identity",
    items: [
      { href: "/settings", label: "Profile", icon: ProfileIcon },
      { href: "/settings/avatar", label: "Avatar", icon: AvatarIcon },
      { href: "/settings/top-friends", label: "Top 6 Pen Pals", icon: PeopleIcon },
    ],
  },
  {
    numeral: "II",
    title: "Appearance",
    items: [
      { href: "/settings/customize", label: "Customize", icon: PaletteIcon },
      { href: "/settings/domain", label: "Custom Domain", icon: LinkIcon },
    ],
  },
  {
    numeral: "III",
    title: "Writing & Content",
    items: [
      { href: "/settings/pinned", label: "Pinned Entries", icon: PinIcon },
      { href: "/settings/series", label: "Series", icon: BookIcon },
      { href: "/settings/polls", label: "My Polls", icon: BarChartIcon },
      { href: "/settings/filters", label: "Filters", icon: FilterIcon },
      { href: "/settings/import", label: "Import", icon: ImportIcon },
      { href: "/settings/redactions", label: "Redactions", icon: RedactIcon },
      { href: "/settings/content-safety", label: "Content Safety", icon: ShieldIcon },
      { href: "/settings/notifications", label: "Notifications", icon: BellIcon },
      { href: "/settings/post-by-email", label: "Post by Email", icon: SendMailIcon },
    ],
  },
  {
    numeral: "IV",
    title: "Community & Social",
    items: [
      { href: "/settings/newsletter", label: "Newsletter", icon: MailIcon },
      { href: "/settings/invite", label: "Invite Friends", icon: InviteIcon },
      { href: "/settings/blocked", label: "Blocked", icon: BlockIcon },
      { href: "/settings/fediverse", label: "Fediverse", icon: GlobeIcon },
    ],
  },
  {
    numeral: "V",
    title: "Billing & Developer",
    items: [
      { href: "/settings/billing", label: "Subscription", icon: StarIcon },
      { href: "/settings/support", label: "Postage", icon: HeartIcon },
      { href: "/settings/subscriptions", label: "Subscriptions", icon: DollarIcon },
      { href: "/settings/api", label: "API Keys", icon: KeyIcon },
    ],
  },
  {
    numeral: "VI",
    title: "Account & Data",
    items: [
      { href: "/settings/export", label: "Data Export", icon: DownloadIcon },
      { href: "/settings/account", label: "Delete Account", icon: TrashIcon, danger: true },
    ],
  },
];

// Exported for reuse by mobile nav
export { SETTINGS_SECTIONS };
export type { SettingsSection, SettingsItem };

// ─── Component ───

export function SettingsLedgerNav() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/settings") return pathname === "/settings";
    return pathname.startsWith(href);
  };

  return (
    <nav className="settings-ledger-nav">
      <div className="settings-ledger-heading">The Settings Ledger</div>

      {SETTINGS_SECTIONS.map((section, i) => (
        <div key={section.numeral}>
          <div className="settings-ledger-section">
            <div className="settings-ledger-section-heading">
              <span className="settings-ledger-numeral">{section.numeral}.</span>
              <span>{section.title}</span>
            </div>
            {section.items.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`settings-ledger-link ${active ? "settings-ledger-link--active" : ""}`}
                  style={item.danger && !active ? { color: "var(--danger, #dc2626)" } : undefined}
                >
                  <span className="settings-ledger-icon">
                    <item.icon />
                  </span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>

          {/* Ornament divider between sections (not after last) */}
          {i < SETTINGS_SECTIONS.length - 1 && (
            <div className="settings-ledger-ornament" aria-hidden="true">
              <span>· · ·</span>
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}
