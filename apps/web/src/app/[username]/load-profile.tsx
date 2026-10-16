import { apiFetch, SERVER_API } from "@/lib/api";
import { getProfile } from "@/lib/queries";
import type { SessionUser } from "@/lib/session";
import { buildProfileStyles } from "@/lib/profile-styles";
import { PROFILE_FONTS } from "@/lib/profile-themes";
import { scopeEntryHtml } from "@/lib/scope-styles";
import { CLASSIC_HOME, homeBlocks, type ProfileHome } from "@/lib/profile-home";
import type { JournalEntry } from "@/components/journal-entry-card";
import { notFoundOrRethrow } from "@/lib/page-errors";
import { archiveQuery, profileFiltersFromParams } from "@/lib/profile-archive-params";
import { getSite } from "@/lib/site";
import type { ProfileContext } from "./profile-layout";
import type { ProfileFrameProps } from "./profile-frame";
import type {
  EntryDisplayMode,
  ProfileEntry,
  ProfileSeriesItem,
  ProfileStyles,
  ProfileUser,
  TopFriendSlot,
} from "./profile-types";

// Everything a profile page needs, fetched once. Shared by the profile page
// and the Arrange my page editor (/arrange), which draws the same page.

export { ProfileFrame, type ProfileFrameProps } from "./profile-frame";

type Archive = ReturnType<typeof profileFiltersFromParams>;


export type LoadedProfile =
  | { kind: "unavailable" }
  | { kind: "blocked_by_me"; profile: ProfileUser }
  | {
      kind: "ok";
      profile: ProfileUser;
      home: ProfileHome;
      ctx: ProfileContext;
      frame: ProfileFrameProps;
      jsonLd: Record<string, unknown>;
    };

export async function loadProfile(
  username: string,
  session: { user: SessionUser; token: string } | null,
  archive: Archive,
  opts: { countView?: boolean } = {},
): Promise<LoadedProfile> {
  const isOwnProfile = session?.user.username === username;

  // Fetch user profile
  let profile!: ProfileUser;
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
  if (!isOwnProfile && opts.countView !== false) {
    fetch(`${SERVER_API}/api/users/${username}/view`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).catch(() => {});
  }


  if (relationshipStatus === "unavailable") return { kind: "unavailable" };
  if (relationshipStatus === "blocked_by_me") return { kind: "blocked_by_me", profile };

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

  return {
    kind: "ok",
    profile,
    home,
    ctx,
    jsonLd: profileJsonLd,
    frame: {
      profile,
      styles,
      isPlus,
      hasCustomBackground,
      fontFamily: font?.family,
      customCssStyles: customCss?.scopedStyles || null,
      scopeId: profileScopeId,
    },
  };
}
