import type { Metadata } from "next";
import { headers } from "next/headers";

import { apiFetch, SERVER_API } from "@/lib/api";
import { getProfile } from "@/lib/queries";
import { getSession, getToken } from "@/lib/session";
import { buildProfileStyles } from "@/lib/profile-styles";
import { PROFILE_FONTS } from "@/lib/profile-themes";
import { scopeEntryHtml } from "@/lib/scope-styles";
import { CLASSIC_HOME, homeBlocks, type ProfileHome } from "@/lib/profile-home";
import { AvatarWithFrame } from "@/components/avatar-with-frame";
import { BlockButton } from "./block-button";
import type { JournalEntry } from "@/components/journal-entry-card";
import { ProfileEffects } from "@/components/profile-effects";
import { SignupCta } from "@/components/signup-cta";
import { notFoundOrRethrow } from "@/lib/page-errors";
import { fediverseHandle } from "@/lib/fediverse";
import { archiveQuery, profileFiltersFromParams } from "@/lib/profile-archive-params";
import { getSite } from "@/lib/site";
import { ProfileLayout, type ProfileContext } from "./profile-layout";
import type {
  EntryDisplayMode,
  ProfileEntry,
  ProfileSeriesItem,
  ProfileUser,
  TopFriendSlot,
} from "./profile-types";

interface ProfileParams {
  params: Promise<{ username: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: ProfileParams): Promise<Metadata> {
  const { username } = await params;

  // Detect custom domain context
  const headersList = await import("next/headers").then(m => m.headers());
  const customDomain = headersList.get("x-custom-domain");

  try {
    // Pass the same token the page component uses so react.cache() dedupes.
    const token = await getToken();
    const data = await getProfile<{ data: ProfileUser; meta?: { custom_domain?: string; noindex?: boolean } }>(username, token);
    const profile = data.data;
    const displayName = profile.display_name || `@${username}`;
    const bio = profile.bio
      ? profile.bio.replace(/<[^>]+>/g, "").slice(0, 160)
      : `@${username} on Inkwell`;
    // Use header (custom domain request) or API response (inkwell.social request)
    const effectiveDomain = customDomain || data.meta?.custom_domain || null;
    const profileUrl = effectiveDomain
      ? `https://${effectiveDomain}`
      : `${getSite().url}/${username}`;
    const rssUrl = effectiveDomain
      ? `https://${effectiveDomain}/api/users/${username}/feed.xml`
      : `${getSite().url}/api/users/${username}/feed.xml`;
    // A drawn 1200×630 cover for the journal (banner, portrait, bio, handle):
    // Facebook and X showed the avatar alone as a small square beside the
    // link. The avatar URL's ?v= stamp changes with the profile, so reuse it
    // to give an updated profile a fresh preview past every cache.
    const version = profile.avatar_url?.match(/[?&]v=([^&]+)/)?.[1];
    const cardUrl = `/api/og/profile/${encodeURIComponent(username)}${version ? `?v=${version}` : ""}`;
    const cardAlt = `${displayName}'s journal on Inkwell`;

    return {
      ...(data.meta?.noindex ? { robots: { index: false, follow: false } } : {}),
      // On the writer's own domain the site is theirs — drop the root
      // layout's "· Inkwell" suffix.
      title: customDomain
        ? { absolute: displayName }
        : effectiveDomain
          ? displayName
          : `@${username}`,
      description: bio,
      ...(effectiveDomain ? { metadataBase: new URL(`https://${effectiveDomain}`) } : {}),
      openGraph: {
        title: displayName,
        description: bio,
        url: profileUrl,
        type: "profile",
        siteName: effectiveDomain ?? "Inkwell",
        images: [{ url: cardUrl, width: 1200, height: 630, alt: cardAlt, type: "image/png" }],
      },
      twitter: {
        site: "@inkwellsocial",
        card: "summary_large_image",
        title: displayName,
        description: bio,
        images: [{ url: cardUrl, alt: cardAlt }],
      },
      alternates: {
        canonical: profileUrl,
        types: {
          "application/rss+xml": rssUrl,
        },
      },
      // FEP-2345, as on entry pages
      other: { "fediverse:creator": fediverseHandle(profile.username ?? username) },
    };
  } catch {
    return { title: `@${username}` };
  }
}

/**
 * Subtle "Powered by Inkwell" footer for custom domain pages.
 * Rendered INSIDE the profile's theme wrapper so it inherits the author's colors.
 */
function PoweredByInkwell() {
  return (
    <div className="text-center py-6 text-xs" style={{ color: "var(--muted)" }}>
      <a
        href={getSite().url}
        className="hover:underline opacity-40 hover:opacity-70 transition-opacity"
        style={{ fontFamily: "var(--font-lora, Georgia, serif)", fontStyle: "italic" }}
      >
        Powered by Inkwell
      </a>
    </div>
  );
}

export default async function ProfilePage({ params, searchParams }: ProfileParams) {
  const { username } = await params;
  // ?year=&month=&page=&sort=&tag=&category=&q= : the archive position, so
  // links and the Back button land on the same page of entries.
  const archive = profileFiltersFromParams(await searchParams);
  const session = await getSession();
  const isOwnProfile = session?.user.username === username;

  // Detect custom domain context (for rendering "Powered by Inkwell" inside theme wrapper)
  const reqHeaders = await headers();
  const isOnCustomDomain = !!reqHeaders.get("x-custom-domain");

  // Fetch user profile
  let profile: ProfileUser;
  let entries: ProfileEntry[] = [];
  let topFriends: TopFriendSlot[] = [];
  let seriesList: ProfileSeriesItem[] = [];
  let entryCount = 0;
  let penPalCount = 0;
  let readerCount = 0;
  let followerCount = 0;
  let followingCount = 0;
  let fediverseFollowerCount = 0;
  let relationshipStatus: string | null = null;
  let incomingRequest = false;
  let letterAccess: string | null = null;

  let entryYears: number[] = [];
  let entryMonths: { year: number; month: number; count: number }[] = [];
  let entryTags: { tag: string; count: number }[] = [];
  let entryCategories: { category: string; count: number }[] = [];

  try {
    // Uses react.cache() — generateMetadata above hits the same key with the
    // same token, so this returns from the in-render cache (no second roundtrip).
    const data = await getProfile<{
      data: ProfileUser;
      meta: {
        entry_count: number;
        pen_pal_count?: number;
        reader_count?: number;
        follower_count?: number;
        following_count?: number;
        fediverse_follower_count?: number;
        top_friends: TopFriendSlot[];
        relationship_status?: string | null;
        entry_years?: number[];
        entry_months?: { year: number; month: number; count: number }[];
        entry_tags?: { tag: string; count: number }[];
        entry_categories?: { category: string; count: number }[];
        incoming_request?: boolean;
        letter_access?: string | null;
        shows_listening?: boolean;
      };
    }>(username, session?.token);

    profile = { ...data.data, shows_listening: data.meta.shows_listening ?? false };
    entryCount = data.meta.entry_count;
    penPalCount = data.meta.pen_pal_count ?? 0;
    readerCount = data.meta.reader_count ?? 0;
    followerCount = data.meta.follower_count ?? 0;
    followingCount = data.meta.following_count ?? 0;
    fediverseFollowerCount = data.meta.fediverse_follower_count ?? 0;
    topFriends = data.meta.top_friends ?? [];
    relationshipStatus = data.meta.relationship_status ?? null;
    incomingRequest = data.meta.incoming_request ?? false;
    letterAccess = data.meta.letter_access ?? null;
    entryYears = data.meta.entry_years ?? [];
    entryMonths = data.meta.entry_months ?? [];
    entryTags = data.meta.entry_tags ?? [];
    entryCategories = data.meta.entry_categories ?? [];
  } catch (err) {
    notFoundOrRethrow(err);
  }

  // Fetch custom domain for own profile (to show "Visit your site" link)
  let customDomainName: string | null = null;
  if (isOwnProfile && session?.token) {
    try {
      const domainRes = await apiFetch<{ data: { domain: string; status: string } | null }>(
        "/api/custom-domain",
        {},
        session.token
      );
      if (domainRes.data && domainRes.data.status === "active") {
        customDomainName = domainRes.data.domain;
      }
    } catch {
      // no domain — ignore
    }
  }

  // Fire-and-forget: increment visitor count for non-owner views
  if (!isOwnProfile) {
    fetch(`${SERVER_API}/api/users/${username}/view`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).catch(() => {});
  }

  // Handle blocked states — show limited profile
  if (relationshipStatus === "unavailable") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--background)", color: "var(--foreground)" }}>
        <div className="text-center p-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--muted)" }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold mb-2">This profile is not available</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            The content you&apos;re looking for cannot be displayed.
          </p>
        </div>
      </div>
    );
  }

  if (relationshipStatus === "blocked_by_me") {
    return (
      <div className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>
        <div className="mx-auto max-w-2xl px-4 py-12">
          <div className="rounded-xl border p-8 text-center" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <AvatarWithFrame url={profile.avatar_url} name={profile.display_name} size={64} frame={profile.avatar_frame} animation={profile.avatar_animation} subscriptionTier={profile.subscription_tier} />
            <h1 className="text-lg font-semibold mt-4">@{profile.username}</h1>
            <p className="text-sm mt-2 mb-6" style={{ color: "var(--muted)" }}>
              You&apos;ve blocked this user. They can&apos;t see your content or interact with you.
            </p>
            <BlockButton targetUsername={username} initialBlocked={true} />
          </div>
        </div>
      </div>
    );
  }

  // The arrangement of the page (Inkwell.ProfileHome on the API). Every
  // account has one; the classic page is only a fallback for an old API.
  const home: ProfileHome = profile.profile_home ?? CLASSIC_HOME;
  const entriesBlock = homeBlocks(home).find((b) => b.type === "entries");

  // Magazine shows entries its own way (a cover story and newspaper
  // columns); otherwise the writer's Entry Display choice.
  const displayMode = (entriesBlock?.config.display === "magazine"
    ? "magazine"
    : (profile.profile_entry_display ?? "cards")) as EntryDisplayMode;
  const perPageDefaults: Record<string, number> = { full: 5, cards: 9, preview: 20, magazine: 10 };
  const perPage = profile.entries_per_page?.[displayMode] ?? perPageDefaults[displayMode] ?? 9;

  // Fetch entries (page 1) + series + pinned entries in parallel
  const pinnedIds = profile.pinned_entry_ids ?? [];
  let pinnedEntries: ProfileEntry[] = [];
  let filteredTotal = entryCount;

  const [entriesResult, seriesResult, stickiesResult] = await Promise.allSettled([
    apiFetch<{ data: ProfileEntry[]; pagination: { total: number } }>(
      `/api/users/${username}/entries?${archiveQuery(archive, perPage)}`,
      {},
      session?.token,
    ),
    apiFetch<{ data: ProfileSeriesItem[] }>(`/api/users/${username}/series`, {}, session?.token),
    apiFetch<{ data: JournalEntry[]; pagination: { total: number } }>(
      `/api/users/${username}/entries?kind=sticky&page=1&per_page=6`,
      {},
      session?.token,
    ),
  ]);
  const stickies = stickiesResult.status === "fulfilled" ? stickiesResult.value.data ?? [] : [];
  const stickyTotal = stickiesResult.status === "fulfilled" ? stickiesResult.value.pagination?.total ?? stickies.length : 0;
  if (entriesResult.status === "fulfilled") {
    entries = entriesResult.value.data ?? [];
    // Total for this archive position (filtered); entryCount stays the
    // profile's whole count, which the API already limits to this viewer.
    if (entriesResult.value.pagination?.total != null) {
      filteredTotal = entriesResult.value.pagination.total;
    }
    // Resolve pinned entries from the first page, or a larger page when
    // some aren't on it.
    if (pinnedIds.length > 0) {
      const found = new Map(entries.map(e => [e.id, e]));
      const missing = pinnedIds.filter(id => !found.has(id));
      if (missing.length > 0) {
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

  // JSON-LD structured data for profile
  const profileJsonLd = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    mainEntity: {
      "@type": "Person",
      name: profile.display_name,
      alternateName: `@${username}`,
      url: `${getSite().url}/${username}`,
      ...(profile.avatar_url
        ? { image: `${getSite().url}/api/avatars/${username}` }
        : {}),
      ...(profile.bio
        ? { description: profile.bio.replace(/<[^>]+>/g, "").slice(0, 300) }
        : {}),
    },
  };

  // Build profile customization styles (tier-aware)
  const isPlus = (profile.subscription_tier ?? "free") === "plus";
  const styles = buildProfileStyles(profile);
  const font = isPlus
    ? PROFILE_FONTS.find((f) => f.id === profile.profile_font)
    : undefined;
  const hasCustomBackground = isPlus && !!profile.profile_background_url;

  // Custom profile HTML/CSS (Plus only)
  const profileScopeId = `profile-${profile.id}`;
  const customContent = isPlus && profile.profile_html
    ? scopeEntryHtml(profile.profile_html, profileScopeId)
    : null;
  const customCss = isPlus && profile.profile_css
    ? scopeEntryHtml(`<style>${profile.profile_css}</style>`, profileScopeId)
    : null;

  const ctx: ProfileContext = {
    profile,
    username,
    styles,
    isPlus,
    isOwnProfile,
    isLoggedIn: !!session,
    viewerUsername: session?.user?.username,
    card: {
      profile,
      username,
      styles,
      isPlus,
      hasCustomBackground,
      isOwnProfile,
      isLoggedIn: !!session,
      customDomainName,
      relationshipStatus,
      incomingRequest,
      letterAccess,
      entryCount,
      followerCount,
      followingCount,
      fediverseFollowerCount,
    },
    topFriends,
    seriesList,
    pinnedEntries,
    customHtml: customContent?.bodyHtml ? customContent : null,
    scopeId: profileScopeId,
    entries: {
      displayMode,
      perPage,
      initial: entries,
      total: entryCount,
      filteredTotal,
      years: entryYears,
      months: entryMonths,
      tags: entryTags,
      categories: entryCategories,
      filters: archive.filters,
      page: archive.page,
      stickies,
      stickyTotal,
    },
  };

  return (
    <div className={`min-h-screen relative ${styles.themeClass}`} data-profile-wrapper style={{
      ...styles.page,
      ...(hasCustomBackground ? { background: "transparent" } : {}),
    }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(profileJsonLd).replace(/</g, "\\u003c"),
        }}
      />
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

      {/* Profile particle effects (Plus only) */}
      {profile.profile_effect && isPlus && (
        <ProfileEffects
          effect={profile.profile_effect}
          intensity={profile.profile_effect_intensity ?? "subtle"}
        />
      )}

      {/* Custom CSS from profile_css field */}
      {customCss?.scopedStyles && (
        <style dangerouslySetInnerHTML={{ __html: customCss.scopedStyles }} />
      )}

      {/* Breakpoints inside are container queries (the profile's own width),
          so the page looks the same whatever else is on screen, e.g. with
          the app sidebar open on a laptop. */}
      <div id={profileScopeId} className={`@container mx-auto px-3 sm:px-4 ${isOnCustomDomain ? "lg:px-8 xl:px-12" : ""} py-8 overflow-hidden ${isOnCustomDomain ? "" : home.width === "narrow" ? "max-w-2xl" : "max-w-7xl"}`}
        style={{ fontFamily: font?.family }}>
        <ProfileLayout home={home} ctx={ctx} />

        {/* Signup CTA for logged-out visitors (not on custom domain — it's their site) */}
        {!session && !isOnCustomDomain && (
          <div className="mt-12 mb-4">
            <SignupCta
              heading="Start your own journal"
              subheading="Customize your space, connect with readers, and join the open social web. No algorithms, no ads."
            />
          </div>
        )}

        {isOnCustomDomain && <PoweredByInkwell />}
      </div>
    </div>
  );
}
