/**
 * The admin console's section catalog — one source of truth for the rail,
 * the overview cards, the panel loader and the document title.
 */

const ic = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
};

/* eslint-disable react/jsx-key */
const I = {
  overview: <svg {...ic}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></svg>,
  users: <svg {...ic}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
  reports: <svg {...ic}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg>,
  moderation: <svg {...ic}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 11 2 2 4-4" /></svg>,
  warnings: <svg {...ic}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>,
  entries: <svg {...ic}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>,
  polls: <svg {...ic}><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>,
  billing: <svg {...ic}><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></svg>,
  growth: <svg {...ic}><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></svg>,
  email: <svg {...ic}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>,
  federation: <svg {...ic}><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>,
  relays: <svg {...ic}><circle cx="12" cy="12" r="2.5" /><path d="M16.24 7.76a6 6 0 0 1 0 8.48M7.76 16.24a6 6 0 0 1 0-8.48" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14" /></svg>,
  domains: <svg {...ic}><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>,
};
/* eslint-enable react/jsx-key */

/** Which live number, if any, belongs on this section's rail badge. */
export type BadgeKey = "pending_reports" | null;

export interface AdminSection {
  /** Stable id — also the `?s=` value. Never rename. */
  id: string;
  label: string;
  /** One line on what this section is for. Shown on the overview card. */
  blurb: string;
  icon: React.ReactNode;
  group: string;
  badge?: BadgeKey;
}

export const ADMIN_GROUPS: { id: string; label: string | null }[] = [
  { id: "top", label: null },
  { id: "people", label: "People" },
  { id: "content", label: "Content" },
  { id: "money", label: "Money & growth" },
  { id: "network", label: "Network" },
];

export const ADMIN_SECTIONS: AdminSection[] = [
  {
    id: "overview",
    label: "Overview",
    blurb: "Platform numbers at a glance, recent signups, and anything that needs looking at.",
    icon: I.overview,
    group: "top",
  },

  // People
  {
    id: "users",
    label: "Users",
    blurb: "Search every account. Promote admins, block, unblock, or delete.",
    icon: I.users,
    group: "people",
  },
  {
    id: "reports",
    label: "Reports",
    blurb: "Content people have flagged. Dismiss, mark sensitive, or warn the author.",
    icon: I.reports,
    group: "people",
    badge: "pending_reports",
  },
  {
    id: "moderation",
    label: "Moderation",
    blurb: "What the spam scorer has blocked or limited, with the reasons — and the undo.",
    icon: I.moderation,
    group: "people",
  },
  {
    id: "warnings",
    label: "Warnings",
    blurb: "Strikes issued to accounts, and where each one stands.",
    icon: I.warnings,
    group: "people",
  },

  // Content
  {
    id: "entries",
    label: "Entries",
    blurb: "Every published entry. Flag one sensitive or take it down.",
    icon: I.entries,
    group: "content",
  },
  {
    id: "polls",
    label: "Polls",
    blurb: "Create a platform-wide poll, close one early, or remove it.",
    icon: I.polls,
    group: "content",
  },

  // Money & growth
  {
    id: "billing",
    label: "Billing",
    blurb: "Who has Plus and why, whether anyone can actually pay, and the Square troubleshooting.",
    icon: I.billing,
    group: "money",
  },
  {
    id: "growth",
    label: "Growth",
    blurb: "Where signups come from — referrers, landing pages and campaign tags.",
    icon: I.growth,
    group: "money",
  },
  {
    id: "email",
    label: "Email",
    blurb: "Write and send a founder announcement to everyone who hasn't opted out.",
    icon: I.email,
    group: "money",
  },

  // Network
  {
    id: "federation",
    label: "Federation",
    blurb: "Inbound and outbound activity, signature failures, and what's being turned away.",
    icon: I.federation,
    group: "network",
  },
  {
    id: "relays",
    label: "Relays",
    blurb: "Fediverse relays feeding Explore. Subscribe, pause, or drop one.",
    icon: I.relays,
    group: "network",
  },
  {
    id: "domains",
    label: "Domains",
    blurb: "Servers defederated instance-wide. Nothing from them reaches anyone here.",
    icon: I.domains,
    group: "network",
  },
];

export const DEFAULT_SECTION = "overview";

export function sectionById(id: string | null | undefined): AdminSection {
  return (
    ADMIN_SECTIONS.find((s) => s.id === id) ??
    ADMIN_SECTIONS.find((s) => s.id === DEFAULT_SECTION)!
  );
}
