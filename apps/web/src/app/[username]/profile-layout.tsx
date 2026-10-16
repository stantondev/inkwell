import type { ReactNode } from "react";

import { ProfileMusicWidget } from "@/components/profile-music-widget";
import { ProfileListening } from "@/components/profile-listening";
import type { JournalEntry } from "@/components/journal-entry-card";
import { columnTracks, type ProfileBlock, type ProfileColumn, type ProfileHome, type ProfileSection } from "@/lib/profile-home";
import type { ProfileFilters } from "./profile-search-bar";
import { Guestbook } from "./guestbook";
import { ProfileSubscribeWidget } from "./profile-subscribe-widget";
import { ProfileCorkboard } from "./profile-corkboard";
import { ProfileEntries } from "./profile-entries";
import { ProfileSearchFilter } from "./profile-search-filter";
import { ProfileCard, type ProfileCardProps } from "./profile-card";
import {
  CustomHtmlWidget,
  PinnedEntries,
  RssWidget,
  SeriesWidget,
  SupportWidget,
  TagCloud,
  TopFriends,
  WidgetColumns,
  supportShown,
} from "./profile-widgets";
import type {
  EntryDisplayMode,
  ProfileEntry,
  ProfileSeriesItem,
  ProfileStyles,
  ProfileUser,
  TopFriendSlot,
} from "./profile-types";

/** Everything a profile's blocks draw from, gathered once by the page. */
export interface ProfileContext {
  profile: ProfileUser;
  username: string;
  styles: ProfileStyles;
  isPlus: boolean;
  isOwnProfile: boolean;
  isLoggedIn: boolean;
  viewerUsername?: string;
  card: ProfileCardProps;
  topFriends: TopFriendSlot[];
  seriesList: ProfileSeriesItem[];
  pinnedEntries: ProfileEntry[];
  customHtml: { bodyHtml: string; scopedStyles?: string | null } | null;
  scopeId: string;
  entries: {
    displayMode: EntryDisplayMode;
    perPage: number;
    initial: ProfileEntry[];
    total: number;
    filteredTotal: number;
    years: number[];
    months: { year: number; month: number; count: number }[];
    tags: { tag: string; count: number }[];
    categories: { category: string; count: number }[];
    filters: ProfileFilters;
    page: number;
    stickies: JournalEntry[];
    stickyTotal: number;
  };
}

/**
 * Whether a block has anything to show this visitor. Decided up front so a
 * section whose blocks are all empty leaves no gap behind.
 */
export function blockVisible(block: ProfileBlock, ctx: ProfileContext): boolean {
  const { profile } = ctx;
  switch (block.type) {
    case "profile_card":
    case "entries":
    case "divider":
    case "rss":
    case "guestbook":
      return true;
    case "tags":
      return ctx.entries.tags.length > 0;
    case "pinned":
      return ctx.pinnedEntries.length > 0;
    case "top_pals":
      return ctx.topFriends.length > 0 || ctx.isOwnProfile;
    case "series":
      return ctx.seriesList.length > 0;
    case "music":
      return (ctx.isPlus && !!profile.profile_music) || !!profile.shows_listening;
    case "support":
      return supportShown(profile);
    case "newsletter":
      return !!profile.newsletter_enabled;
    case "custom_html":
      return !!ctx.customHtml?.bodyHtml;
    default:
      return false;
  }
}

function EntriesBlock({ ctx }: { ctx: ProfileContext }) {
  const { entries: e, styles, username, profile } = ctx;
  const hasFilterMeta = e.years.length > 0 || e.tags.length > 0 || e.categories.length > 0;
  return (
    <section className="min-w-0">
      <ProfileCorkboard
        username={username}
        displayName={profile.display_name || username}
        initialStickies={e.stickies}
        total={e.stickyTotal}
        isOwnProfile={ctx.isOwnProfile}
        mutedColor={styles.muted}
      />
      <h2 className="text-sm font-medium uppercase tracking-widest mb-4" style={{ color: styles.muted }}>
        Journal entries
      </h2>
      {hasFilterMeta && e.total > 3 ? (
        <ProfileSearchFilter
          username={username}
          displayMode={e.displayMode}
          initialEntries={e.initial}
          totalCount={e.total}
          styles={styles}
          entryYears={e.years}
          entryMonths={e.months}
          entryTags={e.tags}
          entryCategories={e.categories}
          perPage={e.perPage}
          initialFilters={e.filters}
          initialPage={e.page}
          initialFilteredTotal={e.filteredTotal}
        />
      ) : (
        <ProfileEntries
          username={username}
          displayMode={e.displayMode}
          initialEntries={e.initial}
          totalCount={e.total}
          styles={styles}
          perPage={e.perPage}
        />
      )}
    </section>
  );
}

/** One block of the page. Every block type is drawn here and only here. */
export function ProfileBlockView({ block, ctx, className }: { block: ProfileBlock; ctx: ProfileContext; className?: string }) {
  const { profile, styles, username } = ctx;

  switch (block.type) {
    case "profile_card":
      return <ProfileCard {...ctx.card} />;
    case "entries":
      return <EntriesBlock ctx={ctx} />;
    case "divider":
      return <div className={`profile-section-divider ${className ?? ""}`} />;
    case "pinned":
      return <PinnedEntries entries={ctx.pinnedEntries} username={username} styles={styles} />;
    case "top_pals":
      return <TopFriends friends={ctx.topFriends} isOwnProfile={ctx.isOwnProfile} styles={styles} />;
    case "tags":
      return <TagCloud tags={ctx.entries.tags} styles={styles} />;
    case "series":
      return <SeriesWidget series={ctx.seriesList} username={username} styles={styles} />;
    case "music": {
      // The song picked in Customize (Plus).
      const song = ctx.isPlus && profile.profile_music ? (
        <ProfileMusicWidget
          music={profile.profile_music}
          surfaceStyle={styles.surface}
          mutedColor={styles.muted}
          borderColor={styles.border}
          borderRadius={styles.borderRadius}
        />
      ) : null;
      // With ListenBrainz connected, what they're listening to comes first;
      // the picked song shows when there's nothing recent.
      if (profile.shows_listening) {
        return (
          <ProfileListening
            username={profile.username}
            fallback={song}
            surfaceStyle={styles.surface}
            mutedColor={styles.muted}
            borderRadius={styles.borderRadius}
          />
        );
      }
      return song;
    }
    case "guestbook":
      return (
        <Guestbook
          username={username}
          isOwnProfile={ctx.isOwnProfile}
          isLoggedIn={ctx.isLoggedIn}
          viewerUsername={ctx.viewerUsername}
          styles={styles}
        />
      );
    case "support":
      return <SupportWidget profile={profile} isOwnProfile={ctx.isOwnProfile} isLoggedIn={ctx.isLoggedIn} styles={styles} />;
    case "newsletter":
      return (
        <ProfileSubscribeWidget
          username={username}
          newsletterName={profile.newsletter_name ?? null}
          newsletterDescription={profile.newsletter_description ?? null}
          subscriberCount={profile.subscriber_count ?? 0}
          styles={styles}
          preview={ctx.isOwnProfile}
        />
      );
    case "custom_html":
      return ctx.customHtml ? <CustomHtmlWidget content={ctx.customHtml} scopeId={ctx.scopeId} styles={styles} /> : null;
    case "rss":
      return <RssWidget username={username} styles={styles} />;
    default:
      return null;
  }
}

// Wide content in a column of its own; a column of only widgets is an aside.
const MAIN_BLOCKS = new Set(["entries", "profile_card", "pinned"]);

function Column({ column, ctx, many }: { column: ProfileColumn; ctx: ProfileContext; many: boolean }) {
  const blocks = column.blocks.filter((b) => blockVisible(b, ctx));
  const content = blocks.map((b) => <ProfileBlockView key={b.id} block={b} ctx={ctx} />);
  if (!many && blocks.length === 1) return content[0];
  const Tag = many && !blocks.some((b) => MAIN_BLOCKS.has(b.type)) ? "aside" : "div";
  return <Tag className="flex flex-col gap-6 min-w-0">{content}</Tag>;
}

function Section({ section, ctx, afterCard }: { section: ProfileSection; ctx: ProfileContext; afterCard: boolean }): ReactNode {
  const columns = section.columns.filter((c) => c.blocks.some((b) => blockVisible(b, ctx)));
  if (columns.length === 0) return null;

  const visible = columns.flatMap((c) => c.blocks.filter((b) => blockVisible(b, ctx)));

  // A divider on its own carries its own spacing, so themes that give
  // dividers margins (broadsheet, zine…) look as they always did: right under
  // the profile card those margins meet the card's; anywhere else they add to
  // the gap, as they did between entries and widgets.
  if (visible.length === 1 && visible[0].type === "divider") {
    const divider = <ProfileBlockView block={visible[0]} ctx={ctx} className={afterCard ? "mb-8" : ""} />;
    return afterCard ? divider : <div className="flow-root mb-8" data-section={section.id}>{divider}</div>;
  }

  // flow-root: what's inside keeps its own margins rather than merging them
  // with the gap between sections.
  if (section.style === "flow") {
    return (
      <div className="flow-root mb-8" data-section={section.id}>
        <WidgetColumns className="@2xl:columns-2 @5xl:columns-3">
          {visible.map((b) => <ProfileBlockView key={b.id} block={b} ctx={ctx} />)}
        </WidgetColumns>
      </div>
    );
  }

  if (columns.length === 1) {
    return (
      <div className="flow-root mb-8" data-section={section.id}>
        <Column column={columns[0]} ctx={ctx} many={false} />
      </div>
    );
  }

  // Side by side from the container's @3xl, one after another below it.
  const tracks = columnTracks(columns);
  return (
    <div
      className="mb-8 grid gap-8 @3xl:grid-cols-[var(--cols-md)] @5xl:grid-cols-[var(--cols-lg)] @6xl:grid-cols-[var(--cols-xl)]"
      style={{ "--cols-md": tracks.md, "--cols-lg": tracks.lg, "--cols-xl": tracks.xl } as React.CSSProperties}
      data-section={section.id}
    >
      {columns.map((c) => <Column key={c.id} column={c} ctx={ctx} many />)}
    </div>
  );
}

/** The whole arrangement: sections down the page, in the writer's order. */
export function ProfileLayout({ home, ctx }: { home: ProfileHome; ctx: ProfileContext }) {
  return (
    <div className="[&>*:last-child]:mb-0">
      {home.sections.map((s, i) => (
        <Section
          key={s.id}
          section={s}
          ctx={ctx}
          afterCard={i > 0 && home.sections[i - 1].columns.some((c) => c.blocks.some((b) => b.type === "profile_card"))}
        />
      ))}
    </div>
  );
}
