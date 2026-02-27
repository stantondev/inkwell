import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getSession } from "@/lib/session";
import { buildProfileStyles } from "@/lib/profile-styles";
import { PROFILE_FONTS } from "@/lib/profile-themes";
import { scopeEntryHtml } from "@/lib/scope-styles";
import { FollowButton } from "./follow-button";
import { WriteLetterButton } from "./write-letter-button";
import { ProfileMusicWidget } from "@/components/profile-music-widget";
import { AvatarWithFrame } from "@/components/avatar-with-frame";
import { Guestbook } from "./guestbook";
import { InlineStatusEditor } from "./inline-status-editor";
import { ProfileSubscribeWidget } from "./profile-subscribe-widget";
import { ProfileSupportWidget } from "./profile-support-widget";
import { ProfileEntries } from "./profile-entries";
import { ProfileSearchFilter } from "./profile-search-filter";
import { TipButton } from "@/components/tip-button";

interface ProfileParams {
  params: Promise<{ username: string }>;
}

interface ProfileUser {
  id: string;
  username: string;
  display_name: string;
  bio: string | null;
  pronouns: string | null;
  avatar_url: string | null;
  avatar_frame?: string | null;
  ap_id: string;
  subscription_tier?: string;
  created_at: string;
  profile_html?: string | null;
  profile_css?: string | null;
  profile_music?: string | null;
  profile_background_url?: string | null;
  profile_banner_url?: string | null;
  profile_background_color?: string | null;
  profile_accent_color?: string | null;
  profile_foreground_color?: string | null;
  profile_font?: string | null;
  profile_layout?: string | null;
  profile_widgets?: { order?: string[]; hidden?: string[] } | null;
  profile_status?: string | null;
  profile_theme?: string | null;
  newsletter_enabled?: boolean;
  newsletter_name?: string | null;
  newsletter_description?: string | null;
  subscriber_count?: number;
  support_url?: string | null;
  support_label?: string | null;
  stripe_connect_enabled?: boolean;
  profile_entry_display?: string | null;
  pinned_entry_ids?: string[];
  social_links?: Record<string, string> | null;
}

interface ProfileEntry {
  id: string;
  slug: string;
  title: string | null;
  body_html: string;
  mood: string | null;
  music: string | null;
  tags: string[];
  stamps?: string[];
  comment_count?: number;
  published_at: string;
  word_count?: number;
  excerpt?: string | null;
  cover_image_id?: string | null;
  category?: string | null;
}

interface ProfileSeriesItem {
  id: string;
  title: string;
  slug: string;
  status: "ongoing" | "completed";
  entry_count: number;
}

interface TopFriendUser {
  username: string;
  display_name: string;
  avatar_url: string | null;
  avatar_frame?: string | null;
}

interface TopFriendSlot {
  position: number;
  user: TopFriendUser;
}

// Social link platform definitions
const SOCIAL_PLATFORMS: Record<string, { label: string; icon: string }> = {
  twitter: { label: "X / Twitter", icon: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" },
  bluesky: { label: "Bluesky", icon: "M12 2C8.5 5.5 5 9.5 5 12c0 3 2 4.5 4.5 4 -2.5 1-4 3-4 5h13c0-2-1.5-4-4-5 2.5.5 4.5-1 4.5-4 0-2.5-3.5-6.5-7-10z" },
  mastodon: { label: "Mastodon", icon: "M21.258 13.99c-.274 1.41-2.456 2.955-4.962 3.254-1.306.156-2.593.3-3.965.236-2.243-.103-4.014-.535-4.014-.535 0 .218.014.426.04.62.292 2.215 2.196 2.347 3.996 2.41 1.82.06 3.44-.45 3.44-.45l.076 1.67s-1.274.684-3.542.81c-1.252.068-2.806-.032-4.612-.51-3.916-1.04-4.588-5.22-4.688-9.46-.028-1.25-.01-2.43-.01-3.415 0-4.307 2.822-5.567 2.822-5.567 1.423-.654 3.867-.927 6.41-.948h.062c2.543.02 4.99.294 6.413.948 0 0 2.822 1.26 2.822 5.567 0 0 .035 3.176-.288 5.37z M17.79 7.63v4.49h-1.78V7.77c0-.92-.387-1.39-1.16-1.39-.855 0-1.283.556-1.283 1.655v2.385h-1.77V8.035c0-1.1-.428-1.655-1.283-1.655-.773 0-1.16.47-1.16 1.39v4.35H7.57V7.63c0-.92.234-1.65.704-2.19.484-.54 1.12-.816 1.907-.816.912 0 1.603.35 2.058 1.053l.443.744.443-.744c.455-.703 1.146-1.053 2.058-1.053.788 0 1.423.277 1.907.816.47.54.704 1.27.704 2.19z" },
  github: { label: "GitHub", icon: "M12 2C6.477 2 2 6.477 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0012 2z" },
  website: { label: "Website", icon: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" },
};

function SocialLinks({ links, styles }: { links: Record<string, string>; styles: ReturnType<typeof buildProfileStyles> }) {
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
            href={url}
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

function PinnedEntries({ entries, username, styles }: { entries: ProfileEntry[]; username: string; styles: ReturnType<typeof buildProfileStyles> }) {
  if (entries.length === 0) return null;
  return (
    <div className="mb-8">
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
                  <p className="text-xs line-clamp-2" style={{ color: styles.muted }}>{entry.excerpt}</p>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function TagCloud({ tags, styles }: { tags: { tag: string; count: number }[]; styles: ReturnType<typeof buildProfileStyles> }) {
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
              href={`/tag/${tag}`}
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

function TopFriends({ friends, isOwnProfile, styles }: { friends: TopFriendSlot[]; isOwnProfile: boolean; styles: ReturnType<typeof buildProfileStyles> }) {
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
            <AvatarWithFrame url={slot.user.avatar_url} name={slot.user.display_name} size={36} frame={slot.user.avatar_frame} />
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

export async function generateMetadata({ params }: ProfileParams): Promise<Metadata> {
  const { username } = await params;
  return { title: `@${username}` };
}

export default async function ProfilePage({ params }: ProfileParams) {
  const { username } = await params;
  const session = await getSession();
  const isOwnProfile = session?.user.username === username;

  // Fetch user profile
  let profile: ProfileUser;
  let entries: ProfileEntry[] = [];
  let topFriends: TopFriendSlot[] = [];
  let seriesList: ProfileSeriesItem[] = [];
  let entryCount = 0;
  let followerCount = 0;
  let followingCount = 0;
  let relationshipStatus: string | null = null;

  let entryYears: number[] = [];
  let entryTags: { tag: string; count: number }[] = [];
  let entryCategories: { category: string; count: number }[] = [];

  try {
    const data = await apiFetch<{
      data: ProfileUser;
      meta: {
        entry_count: number;
        follower_count?: number;
        following_count?: number;
        top_friends: TopFriendSlot[];
        relationship_status?: string | null;
        entry_years?: number[];
        entry_tags?: { tag: string; count: number }[];
        entry_categories?: { category: string; count: number }[];
      };
    }>(`/api/users/${username}`, {}, session?.token);

    profile = data.data;
    entryCount = data.meta.entry_count;
    followerCount = data.meta.follower_count ?? 0;
    followingCount = data.meta.following_count ?? 0;
    topFriends = data.meta.top_friends ?? [];
    relationshipStatus = data.meta.relationship_status ?? null;
    entryYears = data.meta.entry_years ?? [];
    entryTags = data.meta.entry_tags ?? [];
    entryCategories = data.meta.entry_categories ?? [];
  } catch {
    notFound();
  }

  // Compute display mode and per_page for initial fetch
  const displayMode = (profile.profile_entry_display ?? "cards") as "full" | "cards" | "preview";
  const perPageMap = { full: 1, cards: 9, preview: 20 };
  const perPage = perPageMap[displayMode] ?? 9;

  // Fetch entries (page 1) + series + pinned entries in parallel
  const pinnedIds = profile.pinned_entry_ids ?? [];
  let pinnedEntries: ProfileEntry[] = [];

  const [entriesResult, seriesResult] = await Promise.allSettled([
    apiFetch<{ data: ProfileEntry[]; pagination: { total: number } }>(
      `/api/users/${username}/entries?page=1&per_page=${perPage}`,
      {},
      session?.token,
    ),
    apiFetch<{ data: ProfileSeriesItem[] }>(`/api/users/${username}/series`, {}, session?.token),
  ]);
  if (entriesResult.status === "fulfilled") {
    entries = entriesResult.value.data ?? [];
    // Use total from pagination if available (more accurate than profile meta entry_count)
    if (entriesResult.value.pagination?.total != null) {
      entryCount = entriesResult.value.pagination.total;
    }
    // Resolve pinned entries from fetched data or all entries
    if (pinnedIds.length > 0) {
      // Try to find pinned entries in the first page of results
      const found = new Map(entries.map(e => [e.id, e]));
      // For any pinned IDs not in first page, fetch individually
      const missing = pinnedIds.filter(id => !found.has(id));
      if (missing.length > 0) {
        // Fetch all entries and filter — or we can just show what we have
        // For simplicity, fetch a larger page to find them
        try {
          const allRes = await apiFetch<{ data: ProfileEntry[] }>(
            `/api/users/${username}/entries?page=1&per_page=100`,
            {},
            session?.token,
          );
          const allMap = new Map((allRes.data ?? []).map(e => [e.id, e]));
          pinnedEntries = pinnedIds.map(id => allMap.get(id) ?? found.get(id)).filter(Boolean) as ProfileEntry[];
        } catch {
          pinnedEntries = pinnedIds.map(id => found.get(id)).filter(Boolean) as ProfileEntry[];
        }
      } else {
        pinnedEntries = pinnedIds.map(id => found.get(id)).filter(Boolean) as ProfileEntry[];
      }
    }
  }
  if (seriesResult.status === "fulfilled") seriesList = seriesResult.value.data ?? [];

  // Build profile customization styles (tier-aware)
  const isPlus = (profile.subscription_tier ?? "free") === "plus";
  const styles = buildProfileStyles(profile);
  const font = isPlus
    ? PROFILE_FONTS.find((f) => f.id === profile.profile_font)
    : undefined;
  const hasCustomBackground = isPlus && !!profile.profile_background_url;
  const layout = isPlus ? (profile.profile_layout ?? "classic") : "classic";

  // Process custom profile HTML/CSS (Plus only)
  const profileScopeId = `profile-${profile.id}`;
  const customContent = isPlus && profile.profile_html
    ? scopeEntryHtml(profile.profile_html, profileScopeId)
    : null;
  const customCss = isPlus && profile.profile_css
    ? scopeEntryHtml(`<style>${profile.profile_css}</style>`, profileScopeId)
    : null;

  // Widget ordering (Plus only — free users get default order)
  // Merge any new widget types that aren't in the user's saved order (e.g., newsletter/series added after they customized)
  const defaultOrder = ["about", "entries", "top_pals", "tags", "support", "newsletter", "series", "guestbook", "music", "custom_html"];
  const savedOrder = isPlus ? (profile.profile_widgets?.order ?? null) : null;
  const widgetOrder = savedOrder
    ? [...savedOrder, ...defaultOrder.filter((w) => !savedOrder.includes(w))]
    : defaultOrder;
  const hiddenWidgets = new Set(isPlus ? (profile.profile_widgets?.hidden ?? []) : []);

  // Build sidebar widgets based on ordering
  function renderWidget(widgetId: string) {
    if (hiddenWidgets.has(widgetId)) return null;

    switch (widgetId) {
      case "top_pals":
        return <TopFriends key="top_pals" friends={topFriends} isOwnProfile={isOwnProfile} styles={styles} />;
      case "tags":
        return <TagCloud key="tags" tags={entryTags} styles={styles} />;
      case "series":
        if (seriesList.length === 0) return null;
        return (
          <div key="series" className={`profile-widget-card ${styles.borderRadius} border p-3 sm:p-4`} style={styles.surface}>
            <h3 className="text-xs font-medium uppercase tracking-widest mb-3" style={{ color: styles.muted }}>
              Series
            </h3>
            <div className="flex flex-col gap-2">
              {seriesList.map((s) => (
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
      case "music":
        if (!isPlus || !profile.profile_music) return null;
        return (
          <ProfileMusicWidget
            key="music"
            music={profile.profile_music}
            surfaceStyle={styles.surface}
            mutedColor={styles.muted}
            borderColor={styles.border}
            borderRadius={styles.borderRadius}
          />
        );
      case "guestbook":
        return (
          <Guestbook
            key="guestbook"
            username={username}
            isOwnProfile={isOwnProfile}
            isLoggedIn={!!session}
            styles={styles}
          />
        );
      case "support": {
        const hasTips = profile.stripe_connect_enabled && !isOwnProfile && !!session;
        const hasTipsPreview = profile.stripe_connect_enabled && isOwnProfile;
        const hasExternalLink = !!profile.support_url;
        if (!hasTips && !hasTipsPreview && !hasExternalLink) return null;
        return (
          <div key="support" className="flex flex-col gap-4">
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
                ) : (
                  <TipButton
                    recipientId={profile.id}
                    recipientName={profile.display_name}
                  />
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
      case "newsletter":
        if (!profile.newsletter_enabled) return null;
        return (
          <ProfileSubscribeWidget
            key="newsletter"
            username={username}
            newsletterName={profile.newsletter_name ?? null}
            newsletterDescription={profile.newsletter_description ?? null}
            subscriberCount={profile.subscriber_count ?? 0}
            styles={styles}
            preview={isOwnProfile}
          />
        );
      case "custom_html":
        if (!customContent?.bodyHtml) return null;
        return (
          <div key="custom_html" id={profileScopeId} className={`profile-widget-card ${styles.borderRadius} border p-3 sm:p-4 overflow-hidden`} style={styles.surface}>
            {customContent.scopedStyles && (
              <style dangerouslySetInnerHTML={{ __html: customContent.scopedStyles }} />
            )}
            <div dangerouslySetInnerHTML={{ __html: customContent.bodyHtml }} />
          </div>
        );
      default:
        return null;
    }
  }

  // Separate sidebar widgets from main content widgets
  const sidebarWidgetIds = widgetOrder.filter((w) =>
    ["top_pals", "tags", "support", "newsletter", "series", "music", "guestbook", "custom_html"].includes(w)
  );

  // RSS widget (shared across layouts)
  function RssWidget() {
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

  // Entry section (shared across layouts)
  const hasFilterMeta = entryYears.length > 0 || entryTags.length > 0 || entryCategories.length > 0;
  function EntriesSection({ className }: { className?: string }) {
    return (
      <section className={className}>
        <h2 className="text-sm font-medium uppercase tracking-widest mb-4" style={{ color: styles.muted }}>
          Journal entries
        </h2>
        {hasFilterMeta && entryCount > 3 ? (
          <ProfileSearchFilter
            username={username}
            displayMode={displayMode}
            initialEntries={entries}
            totalCount={entryCount}
            styles={styles}
            entryYears={entryYears}
            entryTags={entryTags}
            entryCategories={entryCategories}
          />
        ) : (
          <ProfileEntries
            username={username}
            displayMode={displayMode}
            initialEntries={entries}
            totalCount={entryCount}
            styles={styles}
          />
        )}
      </section>
    );
  }

  return (
    <div className={`min-h-screen relative ${styles.themeClass}`} style={{
      ...styles.page,
      ...(hasCustomBackground ? { background: "transparent" } : {}),
    }}>
      {/* Custom background image */}
      {hasCustomBackground && (
        <div className="fixed inset-0 -z-10" style={{
          backgroundImage: `url(${profile.profile_background_url})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundAttachment: "fixed",
          backgroundColor: styles.page.background || "var(--background)",
        }} />
      )}

      {/* Custom CSS from profile_css field */}
      {customCss?.scopedStyles && (
        <style dangerouslySetInnerHTML={{ __html: customCss.scopedStyles }} />
      )}

      <div id={profileScopeId} className={`mx-auto px-3 sm:px-4 py-8 overflow-hidden ${layout === "minimal" ? "max-w-2xl" : "max-w-7xl"}`}
        style={{ fontFamily: font?.family }}>

        {/* Profile header */}
        <header className={`profile-header-card ${styles.borderRadius} border overflow-hidden mb-8`} style={styles.surface}>
          {/* Banner / header image */}
          <div className={`${profile.profile_banner_url ? "h-32 sm:h-48" : "h-24"} w-full overflow-hidden`} aria-hidden="true"
            style={{
              background: profile.profile_banner_url
                ? "transparent"
                : hasCustomBackground
                  ? "rgba(0,0,0,0.2)"
                  : isPlus && profile.profile_accent_color
                    ? `linear-gradient(135deg, ${profile.profile_accent_color}33 0%, ${styles.surface.background} 100%)`
                    : `linear-gradient(135deg, var(--accent-light) 0%, var(--surface-hover) 100%)`,
            }}>
            {profile.profile_banner_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.profile_banner_url} alt="" className="w-full h-full object-cover" />
            )}
          </div>
          <div className="px-4 sm:px-6 pb-4 sm:pb-6">
            <div className="-mt-10 mb-4 flex items-end justify-between">
              <div className="rounded-full p-1" style={{ background: styles.surface.background }}>
                <AvatarWithFrame url={profile.avatar_url} name={profile.display_name} size={80} frame={profile.avatar_frame} subscriptionTier={profile.subscription_tier} />
              </div>
              {isOwnProfile ? (
                <Link href="/settings"
                  className="rounded-full border px-4 py-1.5 text-sm font-medium transition-colors"
                  style={{ borderColor: styles.border, color: styles.muted }}>
                  Edit profile
                </Link>
              ) : (
                <div className="flex items-center gap-2">
                  <FollowButton
                    targetUsername={username}
                    initialState={
                      relationshipStatus === "accepted" ? "following" :
                      relationshipStatus === "pending" ? "pending" :
                      "idle"
                    }
                  />
                  {/* Write a Letter button — only for accepted pen pals */}
                  {relationshipStatus === "accepted" && session && (
                    <WriteLetterButton username={username} />
                  )}
                </div>
              )}
            </div>

            <div className="mb-2">
              <h1 className="text-2xl font-semibold leading-tight">
                {profile.display_name}
                {profile.subscription_tier === "plus" && (
                  <span className="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium align-middle"
                    style={{ background: styles.accent, color: "#fff" }}>
                    Plus
                  </span>
                )}
                {profile.pronouns && (
                  <span className="ml-2 text-base font-normal" style={{ color: styles.muted }}>
                    ({profile.pronouns})
                  </span>
                )}
              </h1>
              <p className="text-sm" style={{ color: styles.muted }}>@{profile.username}</p>
            </div>

            {/* Status message — inline editable on own profile */}
            {isOwnProfile ? (
              <InlineStatusEditor
                initialStatus={profile.profile_status ?? null}
                mutedColor={styles.muted}
                accentColor={styles.accent}
              />
            ) : (
              profile.profile_status && (
                <p className="text-sm italic mt-1 mb-3" style={{ color: styles.muted }}>
                  &ldquo;{profile.profile_status}&rdquo;
                </p>
              )
            )}

            {profile.bio && (
              <p className="text-sm leading-relaxed mb-4 max-w-prose">{profile.bio}</p>
            )}

            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm" style={{ color: styles.muted }}>
              <span><strong style={{ color: styles.foreground }}>{entryCount}</strong> entries</span>
              {followingCount > 0 && (
                <span><strong style={{ color: styles.foreground }}>{followingCount}</strong> pen pals</span>
              )}
              {followerCount > 0 && (
                <span><strong style={{ color: styles.foreground }}>{followerCount}</strong> readers</span>
              )}
              <span>Joined {new Date(profile.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>
            </div>

            {/* Social links */}
            {profile.social_links && Object.keys(profile.social_links).length > 0 && (
              <SocialLinks links={profile.social_links} styles={styles} />
            )}
          </div>
        </header>

        {/* Section divider between header and content */}
        <div className="profile-section-divider mb-8" />

        {/* Pinned entries (above main content) */}
        {pinnedEntries.length > 0 && (
          <PinnedEntries entries={pinnedEntries} username={username} styles={styles} />
        )}

        {/* Layout variants */}
        {layout === "wide" ? (
          /* Wide: full-width stacked sections */
          <div className="flex flex-col gap-8">
            <EntriesSection />

            <div className="profile-section-divider" />

            {/* Widgets in a grid */}
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {sidebarWidgetIds.map((id) => renderWidget(id))}
              <RssWidget />
            </div>
          </div>
        ) : layout === "minimal" ? (
          /* Minimal: single column, clean */
          <div className="flex flex-col gap-8">
            <EntriesSection />
            <div className="profile-section-divider" />
            {sidebarWidgetIds.map((id) => renderWidget(id))}
            <RssWidget />
          </div>
        ) : (
          /* Classic (default) + Magazine: two-column */
          <div className="grid gap-8 lg:grid-cols-[1fr_300px] xl:grid-cols-[1fr_340px]">
            <EntriesSection className="min-w-0" />

            <aside className="flex flex-col gap-6 min-w-0">
              {sidebarWidgetIds.map((id) => renderWidget(id))}
              <RssWidget />
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
