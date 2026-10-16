import Link from "next/link";

import { AvatarWithFrame } from "@/components/avatar-with-frame";
import { decodeEntities } from "@/lib/decode-entities";
import { TipButton } from "@/components/tip-button";
import { POSTAGE_ENABLED } from "@/lib/paused-features";
import { ProfileSupportWidget } from "./profile-support-widget";
import type { ProfileEntry, ProfileSeriesItem, ProfileStyles, ProfileUser, TopFriendSlot } from "./profile-types";

// The pieces a profile page is built from, shared by every arrangement
// (profile-blocks.tsx decides which ones a page shows and where).

// Social link platform definitions
const SOCIAL_PLATFORMS: Record<string, { label: string; icon: string }> = {
  twitter: { label: "X / Twitter", icon: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" },
  bluesky: { label: "Bluesky", icon: "M12 2C8.5 5.5 5 9.5 5 12c0 3 2 4.5 4.5 4 -2.5 1-4 3-4 5h13c0-2-1.5-4-4-5 2.5.5 4.5-1 4.5-4 0-2.5-3.5-6.5-7-10z" },
  mastodon: { label: "Mastodon", icon: "M21.258 13.99c-.274 1.41-2.456 2.955-4.962 3.254-1.306.156-2.593.3-3.965.236-2.243-.103-4.014-.535-4.014-.535 0 .218.014.426.04.62.292 2.215 2.196 2.347 3.996 2.41 1.82.06 3.44-.45 3.44-.45l.076 1.67s-1.274.684-3.542.81c-1.252.068-2.806-.032-4.612-.51-3.916-1.04-4.588-5.22-4.688-9.46-.028-1.25-.01-2.43-.01-3.415 0-4.307 2.822-5.567 2.822-5.567 1.423-.654 3.867-.927 6.41-.948h.062c2.543.02 4.99.294 6.413.948 0 0 2.822 1.26 2.822 5.567 0 0 .035 3.176-.288 5.37z M17.79 7.63v4.49h-1.78V7.77c0-.92-.387-1.39-1.16-1.39-.855 0-1.283.556-1.283 1.655v2.385h-1.77V8.035c0-1.1-.428-1.655-1.283-1.655-.773 0-1.16.47-1.16 1.39v4.35H7.57V7.63c0-.92.234-1.65.704-2.19.484-.54 1.12-.816 1.907-.816.912 0 1.603.35 2.058 1.053l.443.744.443-.744c.455-.703 1.146-1.053 2.058-1.053.788 0 1.423.277 1.907.816.47.54.704 1.27.704 2.19z" },
  github: { label: "GitHub", icon: "M12 2C6.477 2 2 6.477 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0012 2z" },
  website: { label: "Website", icon: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" },
};

export function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function ensureUrl(url: string): string {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function SocialLinks({ links, styles }: { links: Record<string, string>; styles: ProfileStyles }) {
  const entries = Object.entries(links).filter(([, url]) => url && url.trim());
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {entries.map(([platform, url]) => {
        const info = SOCIAL_PLATFORMS[platform];
        if (!info) return null;
        return (
          <a
            key={platform}
            href={ensureUrl(url)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors hover:opacity-80"
            style={{ borderColor: styles.border, color: styles.muted }}
            title={info.label}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d={info.icon} />
            </svg>
            <span className="hidden sm:inline">{info.label}</span>
          </a>
        );
      })}
    </div>
  );
}

export function PinnedEntries({ entries, username, styles }: { entries: ProfileEntry[]; username: string; styles: ProfileStyles }) {
  if (entries.length === 0) return null;
  return (
    <div>
      <h2 className="flex items-center gap-2 text-sm font-medium uppercase tracking-widest mb-4" style={{ color: styles.muted }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="12" y1="17" x2="12" y2="22" /><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24z" />
        </svg>
        Pinned
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map((entry) => {
          const href = `/${username}/${entry.slug ?? entry.id}`;
          return (
            <article key={entry.id} className={`profile-widget-card profile-entry-item ${styles.borderRadius} border overflow-hidden`} style={styles.surface}>
              {entry.cover_image_id && (
                <div className="w-full overflow-hidden" style={{ maxHeight: 120 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/images/${entry.cover_image_id}`} alt="" className="w-full object-cover" style={{ maxHeight: 120 }} loading="lazy" />
                </div>
              )}
              <div className="p-3">
                {entry.title && (
                  <h3 className="text-sm font-semibold leading-snug mb-1" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
                    <Link href={href} className="hover:underline">{entry.title}</Link>
                  </h3>
                )}
                {entry.excerpt && (
                  <p className="text-xs line-clamp-2" style={{ color: styles.muted }}>{decodeEntities(entry.excerpt)}</p>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export function TagCloud({ tags, styles }: { tags: { tag: string; count: number }[]; styles: ProfileStyles }) {
  if (tags.length === 0) return null;
  const maxCount = Math.max(...tags.map(t => t.count));
  return (
    <div className={`profile-widget-card ${styles.borderRadius} border p-3 sm:p-4`} style={styles.surface}>
      <h3 className="text-xs font-medium uppercase tracking-widest mb-3" style={{ color: styles.muted }}>
        Tags
      </h3>
      <div className="flex flex-wrap gap-1.5">
        {tags.slice(0, 20).map(({ tag, count }) => {
          // Scale font size from 11px to 16px based on frequency
          const ratio = maxCount > 1 ? (count - 1) / (maxCount - 1) : 0;
          const fontSize = 11 + ratio * 5;
          const opacity = 0.5 + ratio * 0.5;
          return (
            <Link
              key={tag}
              href={`/tag/${encodeURIComponent(tag)}`}
              className="profile-tag-chip hover:underline transition-opacity"
              style={{ fontSize: `${fontSize}px`, color: styles.foreground, opacity }}
            >
              #{tag}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function TopFriends({ friends, isOwnProfile, styles }: { friends: TopFriendSlot[]; isOwnProfile: boolean; styles: ProfileStyles }) {
  if (friends.length === 0 && !isOwnProfile) return null;
  return (
    <div className={`profile-widget-card ${styles.borderRadius} border p-3 sm:p-4`} style={styles.surface}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-medium uppercase tracking-widest" style={{ color: styles.muted }}>
          Top Pen Pals
        </h3>
        {isOwnProfile && (
          <Link href="/settings/top-friends" className="text-xs hover:underline"
            style={{ color: styles.accent }}>
            Manage
          </Link>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {friends.map((slot) => (
          <Link key={slot.user.username} href={`/${slot.user.username}`}
            className="flex flex-col items-center gap-1 group">
            <AvatarWithFrame url={slot.user.avatar_url} name={slot.user.display_name} size={36} frame={slot.user.avatar_frame} animation={slot.user.avatar_animation} />
            <span className="text-xs text-center leading-tight truncate w-full group-hover:underline"
              style={{ color: styles.muted }}>
              {slot.user.display_name}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/**
 * Widgets laid out as columns (like a masonry grid): each keeps its own
 * height. In a CSS grid one long widget (the guestbook) stretched every
 * widget in its row to the same ~800px.
 */
export function WidgetColumns({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <div className={`gap-6 ${className} [&>*]:mb-6 [&>*]:break-inside-avoid`}>
      {children}
    </div>
  );
}

export function SeriesWidget({ series, username, styles }: { series: ProfileSeriesItem[]; username: string; styles: ProfileStyles }) {
  if (series.length === 0) return null;
  return (
    <div className={`profile-widget-card ${styles.borderRadius} border p-3 sm:p-4`} style={styles.surface}>
      <h3 className="text-xs font-medium uppercase tracking-widest mb-3" style={{ color: styles.muted }}>
        Series
      </h3>
      <div className="flex flex-col gap-2">
        {series.map((s) => (
          <Link
            key={s.id}
            href={`/${username}/series/${s.slug}`}
            className="flex items-center justify-between gap-2 text-sm group"
          >
            <span className="truncate group-hover:underline" style={{ color: styles.foreground }}>
              {s.title}
            </span>
            <span className="flex items-center gap-1.5 shrink-0">
              {s.status === "completed" && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full"
                  style={{ background: "var(--accent-light)", color: styles.accent }}
                >
                  Done
                </span>
              )}
              <span className="text-xs" style={{ color: styles.muted }}>
                {s.entry_count}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Postage (paused) and the writer's own Ko-fi/Patreon-style link. */
export function supportShown(profile: ProfileUser): boolean {
  return (POSTAGE_ENABLED && !!profile.stripe_connect_enabled) || !!profile.support_url;
}

export function SupportWidget({
  profile,
  isOwnProfile,
  isLoggedIn,
  styles,
}: {
  profile: ProfileUser;
  isOwnProfile: boolean;
  isLoggedIn: boolean;
  styles: ProfileStyles;
}) {
  const hasTips = POSTAGE_ENABLED && profile.stripe_connect_enabled && !isOwnProfile;
  const hasTipsPreview = POSTAGE_ENABLED && profile.stripe_connect_enabled && isOwnProfile;
  const hasExternalLink = !!profile.support_url;
  if (!hasTips && !hasTipsPreview && !hasExternalLink) return null;
  return (
    <div className="flex flex-col gap-4">
      {(hasTips || hasTipsPreview) && (
        <div className={`profile-widget-card ${styles.borderRadius} border p-3 sm:p-4`} style={styles.surface}>
          <h3 className="text-xs font-medium uppercase tracking-widest mb-3" style={{ color: styles.muted }}>
            Support {profile.display_name}
          </h3>
          {hasTipsPreview ? (
            <div className="opacity-60 cursor-default">
              <div
                className={`flex items-center justify-center gap-2 w-full rounded-lg border px-4 py-2.5 text-sm font-medium`}
                style={{ borderColor: styles.accent, color: styles.accent }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                Send postage
              </div>
              <p className="text-xs mt-2 text-center" style={{ color: styles.muted }}>
                Visitors will see this widget
              </p>
            </div>
          ) : isLoggedIn ? (
            <TipButton recipientId={profile.id} recipientName={profile.display_name} />
          ) : (
            <div>
              <div
                className="flex items-center justify-center gap-2 w-full rounded-lg border px-4 py-2.5 text-sm font-medium opacity-60"
                style={{ borderColor: styles.accent, color: styles.accent }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                Send postage
              </div>
              <p className="text-xs mt-2 text-center" style={{ color: styles.muted }}>
                <a href="/get-started" className="font-medium hover:underline" style={{ color: styles.accent }}>
                  Join Inkwell
                </a>{" "}to send postage to {profile.display_name}.
              </p>
            </div>
          )}
        </div>
      )}
      {hasExternalLink && (
        <ProfileSupportWidget
          supportUrl={profile.support_url!}
          supportLabel={profile.support_label ?? null}
          displayName={profile.display_name}
          styles={styles}
          preview={isOwnProfile}
        />
      )}
    </div>
  );
}

export function RssWidget({ username, styles }: { username: string; styles: ProfileStyles }) {
  return (
    <div className={`profile-widget-card ${styles.borderRadius} border p-3 sm:p-4`} style={styles.surface}>
      <h3 className="text-xs font-medium uppercase tracking-widest mb-2" style={{ color: styles.muted }}>Subscribe</h3>
      <a href={`/api/users/${username}/feed.xml`}
        className="flex items-center gap-2 text-sm hover:underline" style={{ color: styles.accent }}
        target="_blank" rel="noopener noreferrer">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/>
          <circle cx="5" cy="19" r="1"/>
        </svg>
        RSS feed
      </a>
    </div>
  );
}

/** The writer's custom HTML (Plus), already scoped to the profile by scopeEntryHtml. */
export function CustomHtmlWidget({
  content,
  scopeId,
  styles,
}: {
  content: { bodyHtml: string; scopedStyles?: string | null };
  scopeId: string;
  styles: ProfileStyles;
}) {
  return (
    <div id={scopeId} className={`profile-widget-card ${styles.borderRadius} border p-3 sm:p-4 overflow-hidden`} style={styles.surface}>
      {content.scopedStyles && <style dangerouslySetInnerHTML={{ __html: content.scopedStyles }} />}
      <div dangerouslySetInnerHTML={{ __html: content.bodyHtml }} />
    </div>
  );
}
