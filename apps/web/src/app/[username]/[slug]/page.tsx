import type { Metadata } from "next";
import Link from "next/link";
import { LocalDate, FULL_DATE, SHORT_DATE } from "@/components/local-date";
import { decodeEntities } from "@/lib/decode-entities";

import { apiFetch, ApiError } from "@/lib/api";
import { getEntry } from "@/lib/queries";
import { getSession, getToken } from "@/lib/session";
import { songFrom, songLabel, resolveMusicEmbed } from "@/lib/music";
import { readingMinutes, readingTimeLabel } from "@/lib/reading-time";
import { AvatarWithFrame } from "@/components/avatar-with-frame";
import { ContentWarning } from "@/components/content-warning";
import { EntryContent } from "@/components/entry-content";
import { JournalPage } from "@/components/journal-page";
import { CommentSection } from "./comment-section";
import { EntryActions } from "./entry-actions";
import { ReportButton } from "./report-button";
import { ReadingProgress } from "./reading-progress";
import { EntryStamps } from "./entry-stamps";
import { OwnerStrip } from "./owner-strip";
import { PublishedNote } from "./published-note";
import { audienceLabel, audienceSentence } from "./audience";
import { EntryCover, EntryMusicEmbed, EntryTags, getMoodHue } from "./entry-parts";
import type { EntryData } from "./entry-types";
import { ArchiveCoverLetter } from "@/components/archive-cover-letter";
import { BookmarkButton } from "@/components/bookmark-button";
import { getCategoryLabel, getCategorySlug } from "@/lib/categories";
import { SeriesNav } from "@/components/series-nav";
import { detectService, getServiceIconSvg } from "@/lib/support-services";
import { InkButton } from "@/components/ink-button";
import { ReprintButton } from "@/components/reprint-button";
import { ShareButton } from "@/components/share-button";
import { TipButton } from "@/components/tip-button";
import { POSTAGE_ENABLED } from "@/lib/paused-features";
import { ReadBeacon } from "@/components/read-beacon";
import { PollWidget } from "@/components/poll-widget";
import { FollowWriterCard } from "@/components/follow-writer-card";
import { PaywallCard } from "@/components/paywall-card";
import { TranslatableEntry, TranslatableTitle } from "@/components/translatable-entry";
import { GalleryHydrator } from "@/components/gallery-hydrator";
import { MarginaliaReader } from "@/components/marginalia/marginalia-reader";
import { StickyNoteCard } from "@/components/sticky-note-card";
import type { JournalEntry } from "@/components/journal-entry-card";
import { StickyActions } from "./sticky-actions";
import { CurrentBlock } from "@/components/current-block";
import { notFoundOrRethrow } from "@/lib/page-errors";
import { fediverseHandle } from "@/lib/fediverse";
import { getSite } from "@/lib/site";
// Comment type imported from shared utils
import type { Comment } from "@/lib/comment-utils";

interface EntryParams {
  params: Promise<{ username: string; slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

/** Words in an HTML body, for entries saved before word_count existed. */
function wordsIn(html: string): number {
  return html.replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length;
}

export async function generateMetadata({ params }: EntryParams): Promise<Metadata> {
  const { username, slug } = await params;

  // Detect custom domain context
  const headersList = await import("next/headers").then(m => m.headers());
  const customDomain = headersList.get("x-custom-domain");

  try {
    const token = await getToken();
    // Cached via react.cache() — the page component below hits the same key
    // and shares this fetch's result.
    const data = await getEntry<{ data: EntryData }>(username, slug, token);
    const entry = { ...data.data, title: data.data.title ? decodeEntities(data.data.title) : data.data.title };
    const isSticky = entry.kind === "sticky";
    // Plain words of the post, entities decoded ("it&#39;s" was reaching
    // Facebook as-is). Figures, code and the quote-reprint "RE:" line are left out.
    const plainBody = decodeEntities(
      (entry.body_html ?? "")
        .replace(/<p[^>]*class="[^"]*quote-inline[^"]*"[^>]*>[\s\S]*?<\/p>/gi, " ")
        .replace(/<(figure|pre|script|style|iframe|video|audio|table)[\s\S]*?<\/\1>/gi, " ")
        .replace(/<[^>]+>/g, " ")
    )
      .replace(/\s+/g, " ")
      .trim();
    const summarySource = (entry.excerpt ? decodeEntities(entry.excerpt).replace(/\s+/g, " ").trim() : "") || plainBody;
    // A post behind a content warning never puts its words in a preview.
    const description = entry.is_sensitive
      ? entry.content_warning
        ? `Content warning: ${entry.content_warning}`
        : "This post has a content warning."
      : summarySource.length > 300
        ? `${summarySource.slice(0, 300).replace(/\s+\S*$/, "")}…`
        : summarySource;
    // Untitled entries (stickies) would otherwise every one of them be
    // titled "Entry by @user" — hundreds of near-duplicate titles competing
    // with each other. Fall back to the post's opening words instead.
    const snippet = entry.is_sensitive
      ? ""
      : plainBody.length > 65 ? `${plainBody.slice(0, 65).replace(/\s+\S*$/, "")}…` : plainBody;
    const fallbackLabel =
      snippet || (isSticky ? `Sticky by @${username}` : `Entry by @${username}`);

    const title = `${entry.title ?? fallbackLabel} · ${username}`;
    const ogTitle = entry.title ?? fallbackLabel;
    // Use header (custom domain request) or API response (inkwell.social request)
    const effectiveDomain = customDomain || entry.custom_domain || null;
    const entryUrl = effectiveDomain
      ? `https://${effectiveDomain}/${slug}`
      : `${getSite().url}/${username}/${slug}`;
    const hasCover = !!entry.cover_image_id && !entry.is_sensitive;
    const authorName = entry.author?.display_name || username;
    // Facebook, iMessage, Slack and LinkedIn lead with the picture and often
    // drop the description, so every entry gets a drawn 1200×630 card
    // (/api/og/entry/…): the cover photo with the title over it, or the
    // writing itself on a page. Declaring the size lets Facebook show it on a
    // link's first share. The version stamp gives an edited post a fresh URL
    // past every cache.
    const version = entry.updated_at ? Date.parse(entry.updated_at) || "" : "";
    const imageUrl = `/api/og/entry/${encodeURIComponent(username)}/${encodeURIComponent(slug)}${version ? `?v=${version}` : ""}`;
    const imageAlt = hasCover
      ? `${ogTitle}, by ${authorName}`
      : `${ogTitle}, by ${authorName}${isSticky ? "" : " — the opening of the entry"}`;
    const ogImages = [{ url: imageUrl, width: 1200, height: 630, alt: imageAlt, type: "image/png" }];

    return {
      // Only when actually served on the writer's domain — inkwell.social
      // keeps the "· Inkwell" suffix from the root layout.
      title: customDomain ? { absolute: title } : title,
      description,
      ...(entry.noindex ? { robots: { index: false, follow: false } } : {}),
      authors: [{ name: entry.author?.display_name ?? username }],
      ...(effectiveDomain ? { metadataBase: new URL(`https://${effectiveDomain}`) } : {}),
      openGraph: {
        title: ogTitle,
        description,
        url: entryUrl,
        type: "article",
        // A page's openGraph replaces the layout's, so the site name has to be restated.
        siteName: effectiveDomain ?? "Inkwell",
        publishedTime: entry.published_at,
        ...(entry.updated_at ? { modifiedTime: entry.updated_at } : {}),
        authors: [authorName],
        ...(entry.tags?.length ? { tags: entry.tags.slice(0, 6) } : {}),
        images: ogImages,
      },
      twitter: {
        site: "@inkwellsocial",
        card: "summary_large_image",
        title: ogTitle,
        description,
        images: [{ url: imageUrl, alt: imageAlt }],
      },
      alternates: {
        canonical: entryUrl,
      },
      // FEP-2345: Mastodon credits the writer on link previews of this page
      // (the actor's attributionDomains lists inkwell.social and their domain).
      other: { "fediverse:creator": fediverseHandle(entry.author?.username ?? username) },
    };
  } catch {
    return { title: `Entry · @${username}` };
  }
}

function QuotedPostEmbed({ quoted }: { quoted: NonNullable<EntryData["quoted_entry"]> }) {
  const href = quoted.type === "remote"
    ? (quoted.url || "#")
    : `/${quoted.author.username}/${quoted.slug}`;
  const isExternal = quoted.type === "remote";

  const avatarSrc = quoted.author.avatar_url?.startsWith("data:")
    ? `/api/avatars/${quoted.author.username}`
    : quoted.author.avatar_url;

  const readTime = quoted.word_count ? readingTimeLabel(quoted.word_count) : null;

  return (
    <div className="reprint-quoted-post" style={{ marginTop: "2rem" }}>
      <div className="reprint-quoted-header">
        <div className="reprint-quoted-author">
          {avatarSrc && (
            <img src={avatarSrc} alt="" className="reprint-quoted-avatar" />
          )}
          <div className="reprint-quoted-author-info">
            <span className="reprint-quoted-author-name">
              {quoted.author.display_name}
            </span>
            <span className="reprint-quoted-author-handle">
              @{quoted.author.username}{quoted.author.domain ? `@${quoted.author.domain}` : ""}
            </span>
          </div>
          {quoted.type === "remote" && (
            <span style={{ marginLeft: "auto", fontSize: "0.75rem", opacity: 0.6 }}>🌐</span>
          )}
        </div>
      </div>

      {quoted.cover_image_id && (
        <img
          src={`/api/images/${quoted.cover_image_id}`}
          alt=""
          className="reprint-quoted-cover"
        />
      )}

      {quoted.title && (
        <h3 className="reprint-quoted-title">
          {isExternal ? (
            <a href={href} target="_blank" rel="noopener noreferrer">{quoted.title}</a>
          ) : (
            <Link href={href}>{quoted.title}</Link>
          )}
        </h3>
      )}

      {quoted.body_html && (
        <div
          className="prose-entry reprint-quoted-body reprint-quoted-body-full"
          dangerouslySetInnerHTML={{ __html: quoted.body_html }}
        />
      )}

      {quoted.tags && quoted.tags.length > 0 && (
        <div className="reprint-quoted-tags">
          {quoted.tags.map((tag) => (
            <Link key={tag} href={`/tag/${encodeURIComponent(tag)}`} className="reprint-quoted-tag">
              #{tag}
            </Link>
          ))}
        </div>
      )}

      <div className="reprint-quoted-footer">
        {readTime && <span>{readTime}</span>}
        {quoted.category && (
          <span style={{ textTransform: "capitalize" }}>{quoted.category.replace(/_/g, " ")}</span>
        )}
        <span style={{ marginLeft: "auto" }}>
          {isExternal ? (
            <a href={href} target="_blank" rel="noopener noreferrer" className="reprint-quoted-link">
              View original →
            </a>
          ) : (
            <Link href={href} className="reprint-quoted-link">
              Open full entry →
            </Link>
          )}
        </span>
      </div>
    </div>
  );
}

export default async function EntryPage({ params, searchParams }: EntryParams) {
  const { username, slug } = await params;
  const query = (await searchParams) ?? {};
  const token = await getToken();
  const session = await getSession();

  // Detect custom domain context
  const headersList = await import("next/headers").then(m => m.headers());
  const customDomain = headersList.get("x-custom-domain");

  let entry: EntryData;
  try {
    // Cached — generateMetadata above already fetched this with the same token.
    const data = await getEntry<{ data: EntryData }>(username, slug, token);
    // A few titles were stored with HTML entities in them (old quote-reprint
    // backfill), which React then printed literally: "you&#39;re".
    entry = { ...data.data, title: data.data.title ? decodeEntities(data.data.title) : data.data.title };
  } catch (err) {
    notFoundOrRethrow(err);
  }

  // Use header (custom domain request) or API response (inkwell.social request) for canonical URLs
  const effectiveDomain = customDomain || entry.custom_domain || null;
  const baseUrl = effectiveDomain ? `https://${effectiveDomain}` : `${getSite().url}`;
  const shareUrl = effectiveDomain ? `${baseUrl}/${slug}` : `${getSite().url}/${username}/${slug}`;

  const author = entry.author;
  const isOwnEntry = session?.user.username === username;
  const isAdmin = session?.user.is_admin ?? false;

  // Footnotes are fetched as the viewer: on a pen-pals-only, circle or
  // custom-list entry the API only lists them for someone allowed to read it.
  // A 404 means none to show; anything else (an outage) is logged and the
  // page still renders, without pretending the entry has no footnotes.
  const commentsPromise = apiFetch<{ data: Comment[] }>(
    `/api/users/${encodeURIComponent(username)}/entries/${encodeURIComponent(slug)}/comments`,
    {},
    token
  )
    .then((data) => data.data ?? [])
    .catch((err: unknown) => {
      if (!(err instanceof ApiError && err.status === 404)) {
        console.error(`[entry page] couldn't load footnotes for ${username}/${slug}`, err);
      }
      return [] as Comment[];
    });

  // The writer's own page: pinned entries (for the Pin item) and, for a
  // custom-list entry, the list's name.
  const pinnedPromise: Promise<string[]> = isOwnEntry && token
    ? apiFetch<{ data?: { pinned_entry_ids?: string[] } }>("/api/me", {}, token)
        .then((d) => d.data?.pinned_entry_ids ?? [])
        .catch(() => [])
    : Promise.resolve([]);
  const listNamePromise: Promise<string | null> =
    isOwnEntry && token && entry.privacy === "custom" && entry.custom_filter_id
      ? apiFetch<{ data?: { id: string; name: string }[] }>("/api/filters", {}, token)
          .then((d) => d.data?.find((f) => f.id === entry.custom_filter_id)?.name ?? null)
          .catch(() => null)
      : Promise.resolve(null);

  const [comments, pinnedEntryIds, listName] = await Promise.all([commentsPromise, pinnedPromise, listNamePromise]);

  if (entry.kind === "sticky") {
    return (
      <StickyPage
        entry={entry}
        username={username}
        comments={comments}
        session={session}
        isOwnEntry={isOwnEntry ?? false}
        isAdmin={isAdmin}
        shareUrl={shareUrl}
        showSignup={!session}
        onCustomDomain={!!customDomain}
      />
    );
  }

  const moodHue = getMoodHue(entry.mood_key, entry.mood);
  // Prefer stored word_count (set at save time); fall back to counting the body.
  const mins = readingMinutes(entry.word_count && entry.word_count > 0 ? entry.word_count : wordsIn(entry.body_html));
  const progressColor = moodHue !== null
    ? `hsl(${moodHue} 65% 55%)`
    : "var(--accent)";

  const musicEmbed = resolveMusicEmbed(entry.music, entry.music_metadata);
  const listened = songFrom(entry.music, entry.music_metadata);

  const audience = { privacy: entry.privacy, listName, circleName: entry.circle?.name ?? null };
  const justPublished = isOwnEntry && query.published === "1";
  // An owner's own entry with nothing stamped renders no stamp row at all.
  const showStamps = !isOwnEntry || (entry.stamps?.length ?? 0) > 0;

  // JSON-LD description: never the words of a post behind a content warning.
  const ldDescription = entry.is_sensitive
    ? entry.content_warning
      ? `Content warning: ${entry.content_warning}`
      : "This post has a content warning."
    : decodeEntities(entry.excerpt || entry.body_html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160));

  return (
    <div
      className="min-h-screen"
      style={{
        background: "var(--background)",
        color: "var(--foreground)",
        ...(moodHue !== null ? { "--mood-hue": String(moodHue) } as React.CSSProperties : {}),
      }}
    >
      {/* JSON-LD Article structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: entry.title || `Entry by @${username}`,
            author: {
              "@type": "Person",
              name: author.display_name,
              url: effectiveDomain ? baseUrl : `${getSite().url}/${username}`,
            },
            datePublished: entry.published_at,
            ...(entry.updated_at && entry.updated_at !== entry.published_at
              ? { dateModified: entry.updated_at }
              : {}),
            description: ldDescription,
            ...(entry.word_count ? { wordCount: entry.word_count } : {}),
            ...(entry.cover_image_id && !entry.is_sensitive
              ? {
                  image: `${baseUrl}/api/images/${entry.cover_image_id}`,
                }
              : {}),
            publisher: {
              "@type": "Organization",
              name: "Inkwell",
              url: getSite().url,
            },
            mainEntityOfPage: {
              "@type": "WebPage",
              "@id": shareUrl,
            },
          }).replace(/</g, "\\u003c"),
        }}
      />

      <ReadingProgress color={progressColor} />

      {/* ── Ambient hero header ─────────────────────────────────────── */}
      <div className={moodHue !== null ? "entry-ambient" : ""}>

        <div className="entry-wide px-4 sm:px-6 md:px-8 lg:px-12 pt-10 pb-12 relative">

          {/* Stamps — horizontal row inline on mobile, absolute top-right on desktop */}
          {showStamps && (
            <div className="flex justify-end mb-3 sm:mb-0 sm:absolute sm:top-8 sm:right-6 md:right-8 lg:right-12 z-10">
              <EntryStamps
                entryId={entry.id}
                initialStamps={entry.stamps ?? []}
                initialMyStamp={entry.my_stamp ?? null}
                isOwnEntry={isOwnEntry ?? false}
                isLoggedIn={!!session}
                isPlus={session?.user.subscription_tier === "plus"}
              />
            </div>
          )}

          {/* Nav row */}
          <div className="flex flex-col gap-3 mb-6">
            <Link
              href={`/${username}`}
              className="text-sm transition-colors hover:underline flex items-center gap-1.5"
              style={{ color: "var(--muted)" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 12H5M12 5l-7 7 7 7"/>
              </svg>
              @{username}
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <InkButton
                entryId={entry.id}
                initialInked={entry.my_ink ?? false}
                initialCount={entry.ink_count ?? 0}
                isOwnEntry={isOwnEntry ?? false}
                isLoggedIn={!!session}
                size={18}
              />
              <ReprintButton
                entryId={entry.id}
                initialReprinted={entry.my_reprint ?? false}
                initialCount={entry.reprint_count ?? 0}
                isOwnEntry={isOwnEntry ?? false}
                isLoggedIn={!!session}
                isRemote={false}
                size={18}
              />
              {session && (
                <BookmarkButton
                  entryId={entry.id}
                  initialBookmarked={entry.bookmarked ?? false}
                  isLoggedIn={true}
                  size={18}
                />
              )}
              <ShareButton
                url={shareUrl}
                title={entry.title || "Entry"}
                description={entry.is_sensitive ? "" : entry.excerpt || entry.title || ""}
                size={18}
              />
              {session && !isOwnEntry && (
                <ReportButton entryId={entry.id} />
              )}
              {!isOwnEntry && isAdmin && (
                <EntryActions entryId={entry.id} username={username} showEdit={false} />
              )}
            </div>
            {isOwnEntry && (
              // Clear of the stamps, which sit top-right on wider screens.
              <div className={showStamps ? "sm:pr-28" : undefined}>
                <OwnerStrip
                  entryId={entry.id}
                  username={username}
                  audience={audienceLabel(audience)}
                  readCount={entry.read_count}
                  initialPinned={pinnedEntryIds.includes(entry.id)}
                  pinnedCount={pinnedEntryIds.length}
                />
              </div>
            )}
          </div>

          {isOwnEntry && (
            <PublishedNote show={justPublished} sentence={audienceSentence(audience)} url={shareUrl} />
          )}

          {/* Date */}
          <LocalDate
            iso={entry.published_at}
            options={FULL_DATE}
            className="block text-sm mb-5"
            style={{ color: "var(--muted)", letterSpacing: "0.01em" }}
          />

          {entry.source_sticky && (
            <Link
              href={`/${entry.source_sticky.username}/${entry.source_sticky.slug}`}
              className="entry-grew-from"
              title={entry.source_sticky.excerpt ?? undefined}
            >
              Grew from a sticky &rarr;
            </Link>
          )}

          {entry.gazette_story && (
            <Link
              href={`/gazette/story/${entry.gazette_story.id}`}
              className="entry-grew-from entry-grew-from--gazette"
              title={entry.gazette_story.provider_name ?? undefined}
            >
              In response to &ldquo;{entry.gazette_story.title}&rdquo; in the Gazette &rarr;
            </Link>
          )}

          {entry.circle && (
            <div className="entry-circle-line">
              {entry.circle_prompt ? (
                <Link href={`/circles/${entry.circle.slug}/t/${entry.circle_prompt.id}`} className="entry-grew-from">
                  An answer to &ldquo;{entry.circle_prompt.title || "a thread"}&rdquo; in {entry.circle.name}
                  {entry.privacy === "circle" ? " · members only" : ""} &rarr;
                </Link>
              ) : (
                <Link href={`/circles/${entry.circle.slug}/t/${entry.id}`} className="entry-grew-from">
                  {entry.circle.is_prompt ? "The pinned prompt" : "A thread"} in {entry.circle.name}
                  {entry.privacy === "circle" ? " · members only" : ""} &rarr;
                </Link>
              )}
              {!entry.circle_prompt && entry.circle.viewer_role && (
                <Link href={`/editor?circle=${entry.circle.id}&circle_prompt=${entry.id}`} className="entry-grew-from">
                  Write your answer &rarr;
                </Link>
              )}
            </div>
          )}

          {/* Title */}
          {entry.title && (
            <h1
              className="text-2xl sm:text-4xl font-bold leading-tight mb-7 pr-20 sm:pr-28"
              style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
            >
              <TranslatableTitle id={entry.id}>{entry.title}</TranslatableTitle>
            </h1>
          )}

          {/* Meta chips */}
          <div className="flex flex-wrap items-center gap-2.5">
            <Link href={`/${username}`} className="flex items-center gap-2 hover:underline">
              {entry.userpic ? (
                // A chosen userpic is shown bigger than the default avatar, as on LiveJournal.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={entry.userpic.url} alt="" title={entry.userpic.keyword}
                  width={48} height={48} className="entry-userpic" />
              ) : (
                <AvatarWithFrame
                  url={author.avatar_url}
                  name={author.display_name}
                  size={26}
                  frame={author.avatar_frame}
                  animation={author.avatar_animation}
                  subscriptionTier={author.subscription_tier ?? undefined}
                />
              )}
              <span className="text-sm font-medium">{author.display_name}</span>
            </Link>

            <span aria-hidden="true" style={{ color: "var(--border)" }}>·</span>

            <span className="text-sm" style={{ color: "var(--muted)" }}>
              {mins} min read
            </span>

            {POSTAGE_ENABLED && isOwnEntry && entry.tip_total_cents != null && entry.tip_total_cents > 0 && (
              <>
                <span aria-hidden="true" style={{ color: "var(--border)" }}>·</span>
                <span className="text-sm" style={{ color: "var(--accent)" }}>
                  ${(entry.tip_total_cents / 100).toFixed(2)} in postage
                </span>
              </>
            )}

            {entry.category && (
              <>
                <span aria-hidden="true" style={{ color: "var(--border)" }}>·</span>
                <Link
                  href={`/category/${getCategorySlug(entry.category)}`}
                  className="text-sm px-2.5 py-1 rounded-full transition-colors hover:opacity-80"
                  style={{
                    background: "var(--accent-light)",
                    color: "var(--accent)",
                  }}
                >
                  {getCategoryLabel(entry.category)}
                </Link>
              </>
            )}

          </div>

          <CurrentBlock
            mood={entry.mood}
            moodKey={entry.mood_key}
            moodTheme={entry.mood_theme}
            music={entry.music ? (listened ? songLabel(listened) : musicEmbed ? musicEmbed.title || musicEmbed.label : entry.music) : null}
            location={entry.location}
            song={listened}
          />

          {/* ── Archive cover letter (posts brought over from LiveJournal etc.) ── */}
          {entry.archive_mark && entry.imported_from && (
            <ArchiveCoverLetter
              entryId={entry.id}
              origin={entry.imported_from}
              publishedAt={entry.published_at}
              originalUrl={entry.imported_url ?? null}
              note={entry.archive_note ?? null}
              authorName={author.display_name || `@${username}`}
              isOwnEntry={isOwnEntry ?? false}
            />
          )}
        </div>
      </div>

      {/* ── The entry: cover, series, body, player, tags ─────────────
          One content-warning gate for all of it, so a warned entry with a
          cover needs one "Show content", and the player waits too. Title,
          byline and stamps stay outside, as on the feed cards. */}
      <article className="entry-wide px-4 sm:px-6 md:px-8 lg:px-12 pb-16">
        <ContentWarning isSensitive={!!entry.is_sensitive} contentWarning={entry.content_warning}>
          {entry.cover_image_id && (
            <EntryCover imageId={entry.cover_image_id} alt={entry.title ?? "Entry cover"} />
          )}

          {entry.series && entry.series_order && (
            <SeriesNav series={entry.series} currentOrder={entry.series_order} />
          )}

          {entry.is_paywalled && entry.writer_plan ? (
            <div>
              {entry.excerpt && (
                <JournalPage corner className="p-6 lg:p-10">
                  <div className="prose-entry" style={{ color: "var(--foreground)" }}>
                    <p>{entry.excerpt}</p>
                  </div>
                </JournalPage>
              )}
              <PaywallCard
                writerPlan={entry.writer_plan}
                author={entry.author}
                isLoggedIn={!!session}
              />
            </div>
          ) : (
            <>
              <MarginaliaReader
                entryId={entry.id}
                entryUserId={entry.author.id}
                initialNotes={entry.marginalia ?? []}
                initialOrphaned={entry.orphaned_marginalia ?? []}
                viewer={{
                  id: session?.user.id ?? "",
                  isLoggedIn: !!session,
                }}
              >
                <JournalPage corner className="p-6 lg:p-10">
                  <TranslatableEntry
                    type="entry"
                    id={entry.id}
                    originalBodyHtml={entry.body_html}
                    preferredLanguage={session?.user.preferred_language}
                    isLoggedIn={!!session}
                    loginHref={`/login?next=${encodeURIComponent(`/${username}/${slug}`)}`}
                  >
                    <EntryContent
                      html={entry.body_html}
                      entryId={entry.id}
                      className={`prose-entry entry-body${entry.title ? " drop-cap" : ""}`}
                    />
                    <GalleryHydrator authorIsPlus={entry.author.subscription_tier === "plus"} />
                  </TranslatableEntry>
                </JournalPage>
              </MarginaliaReader>

              {/* Quoted / Reprinted entry — full original post embedded */}
              {entry.quoted_entry && (
                <QuotedPostEmbed quoted={entry.quoted_entry} />
              )}
            </>
          )}

          {/* The player comes after the writing, so the first lines of the
              entry are on the first screen. "Current music" stays at the top. */}
          {musicEmbed && (
            <EntryMusicEmbed embed={musicEmbed} music={entry.music!} />
          )}

          {!entry.is_paywalled && <EntryTags tags={entry.tags} />}
        </ContentWarning>

        {/* Reader stats: counts this visit once it's actually been read */}
        {!isOwnEntry && <ReadBeacon entryId={entry.id} />}

        {/* Entry Poll */}
        {entry.poll && (
          <div className="mt-10 pt-8 border-t" style={{ borderColor: "var(--border)" }}>
            <PollWidget poll={entry.poll} isLoggedIn={!!session} />
          </div>
        )}

        {/* Support CTA */}
        {((POSTAGE_ENABLED && author.stripe_connect_enabled) || author.support_url) && !isOwnEntry && (
          <div className="mt-8 pt-6 border-t flex flex-col items-center gap-3" style={{ borderColor: "var(--border)" }}>
            {POSTAGE_ENABLED && author.stripe_connect_enabled && (
              session ? (
                <TipButton
                  recipientId={author.id}
                  recipientName={author.display_name}
                  entryId={entry.id}
                />
              ) : (
                <a href="/get-started"
                  className="inline-flex items-center gap-2 rounded-lg border px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-80"
                  style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                  Join Inkwell to send postage
                </a>
              )
            )}
            {author.support_url && (
              <a
                href={author.support_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-80"
                style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
              >
                <span
                  dangerouslySetInnerHTML={{ __html: getServiceIconSvg(detectService(author.support_url).icon) }}
                  style={{ color: detectService(author.support_url).color !== "var(--accent)" ? detectService(author.support_url).color : undefined }}
                  className="flex items-center"
                />
                {author.support_label || `Support ${author.display_name}'s writing`}
              </a>
            )}
          </div>
        )}

        {/* Older / newer in this journal, for reading back through an archive */}
        {(entry.journal_nav?.older || entry.journal_nav?.newer) && (
          <nav
            aria-label="More from this journal"
            className="mt-8 pt-6 border-t grid gap-3 sm:grid-cols-2"
            style={{ borderColor: "var(--border)" }}
          >
            {entry.journal_nav?.older ? (
              <Link
                href={`/${username}/${entry.journal_nav.older.slug}`}
                className="rounded-xl border p-4 transition-colors hover:opacity-80"
                style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                rel="prev"
              >
                <span className="block text-xs mb-1" style={{ color: "var(--muted)" }}>
                  ← Older · <LocalDate iso={entry.journal_nav.older.published_at} options={SHORT_DATE} />
                </span>
                <span className="block text-sm font-medium line-clamp-2" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
                  {decodeEntities(entry.journal_nav.older.title || "") || "Untitled entry"}
                </span>
              </Link>
            ) : (
              <span className="hidden sm:block" />
            )}
            {entry.journal_nav?.newer && (
              <Link
                href={`/${username}/${entry.journal_nav.newer.slug}`}
                className="rounded-xl border p-4 text-right transition-colors hover:opacity-80"
                style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                rel="next"
              >
                <span className="block text-xs mb-1" style={{ color: "var(--muted)" }}>
                  <LocalDate iso={entry.journal_nav.newer.published_at} options={SHORT_DATE} /> · Newer →
                </span>
                <span className="block text-sm font-medium line-clamp-2" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
                  {decodeEntities(entry.journal_nav.newer.title || "") || "Untitled entry"}
                </span>
              </Link>
            )}
          </nav>
        )}

        {/* Author card */}
        <div className="mt-8 pt-8 border-t flex items-center gap-4" style={{ borderColor: "var(--border)" }}>
          <Link href={`/${username}`} className="flex-shrink-0">
            <AvatarWithFrame
              url={author.avatar_url}
              name={author.display_name}
              size={48}
              frame={author.avatar_frame}
              animation={author.avatar_animation}
              subscriptionTier={author.subscription_tier ?? undefined}
            />
          </Link>
          <div className="flex-1 min-w-0">
            <Link href={`/${username}`} className="font-semibold hover:underline">
              {author.display_name}
            </Link>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              @{username}
              {author.bio && ` · ${author.bio}`}
            </p>
          </div>
          <Link href="/feed" className="text-sm hover:underline flex-shrink-0" style={{ color: "var(--muted)" }}>
            ← Feed
          </Link>
        </div>
      </article>

      {/* Signed-out readers mostly arrive from a shared link: offer every way
          to follow this writer, not just "join Inkwell". */}
      {!session && (
        <div className="entry-wide px-4 sm:px-6 md:px-8 lg:px-12 pb-10">
          <FollowWriterCard
            username={username}
            displayName={author?.display_name || username}
            newsletterEnabled={!!author?.newsletter_enabled}
            newsletterName={author?.newsletter_name}
            onCustomDomain={!!customDomain}
          />
        </div>
      )}

      {/* ── Marginalia (Comments) ───────────────────────────────────── */}
      <CommentSection
        comments={comments}
        entryId={entry.id}
        session={session}
      />

      {/* Subtle attribution footer on custom domain — inside theme wrapper so colors match */}
      {customDomain && (
        <div className="text-center py-6 text-xs" style={{ color: "var(--muted)" }}>
          <a
            href={getSite().url}
            className="hover:underline opacity-40 hover:opacity-70 transition-opacity"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)", fontStyle: "italic" }}
          >
            Powered by Inkwell
          </a>
        </div>
      )}
    </div>
  );
}

// ─── A Sticky's own page ───────────────────────────────────────────────────

function StickyPage({
  entry,
  username,
  comments,
  session,
  isOwnEntry,
  isAdmin,
  shareUrl,
  showSignup,
  onCustomDomain,
}: {
  entry: EntryData;
  username: string;
  comments: Comment[];
  session: Awaited<ReturnType<typeof getSession>>;
  isOwnEntry: boolean;
  isAdmin: boolean;
  shareUrl: string;
  showSignup: boolean;
  onCustomDomain: boolean;
}) {
  const author = entry.author;
  const excerpt = entry.excerpt || entry.body_html.replace(/<[^>]+>/g, "").slice(0, 160);

  return (
    <div className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <div className="mx-auto max-w-2xl px-4 sm:px-6 pt-10 pb-8">
        <div className="flex items-center justify-between gap-3 mb-6">
          <Link href={`/${username}`} className="flex items-center gap-2.5 min-w-0 group">
            <AvatarWithFrame
              url={author.avatar_url}
              name={author.display_name}
              size={36}
              frame={author.avatar_frame}
              animation={author.avatar_animation}
              subscriptionTier={author.subscription_tier ?? undefined}
            />
            <span className="min-w-0">
              <span className="block font-semibold truncate group-hover:underline">{author.display_name}</span>
              <span className="block text-sm" style={{ color: "var(--muted)" }}>
                @{username} &middot; <LocalDate iso={entry.published_at} options={FULL_DATE} />
              </span>
            </span>
          </Link>
          <EntryStamps
            entryId={entry.id}
            initialStamps={entry.stamps ?? []}
            initialMyStamp={entry.my_stamp ?? null}
            isOwnEntry={isOwnEntry}
            isLoggedIn={!!session}
            isPlus={session?.user.subscription_tier === "plus"}
          />
        </div>

        <StickyNoteCard entry={entry as unknown as JournalEntry} isOwn={isOwnEntry} variant="page" />

        <div className="flex flex-wrap items-center gap-3 mt-6">
          <InkButton entryId={entry.id} initialInked={entry.my_ink ?? false} initialCount={entry.ink_count ?? 0} isOwnEntry={isOwnEntry} isLoggedIn={!!session} size={18} />
          <ReprintButton entryId={entry.id} initialReprinted={entry.my_reprint ?? false} initialCount={entry.reprint_count ?? 0} isOwnEntry={isOwnEntry} isLoggedIn={!!session} isRemote={false} size={18} />
          {session && <BookmarkButton entryId={entry.id} initialBookmarked={entry.bookmarked ?? false} isLoggedIn={true} size={18} />}
          <ShareButton url={shareUrl} title={`Sticky by @${username}`} description={excerpt} size={18} />
          {session && !isOwnEntry && <ReportButton entryId={entry.id} />}
          <span className="flex-1" />
          {isOwnEntry && (
            <StickyActions
              username={username}
              sticky={{ id: entry.id, body_html: entry.body_html, sticky_color: entry.sticky_color, privacy: entry.privacy }}
            />
          )}
          {!isOwnEntry && isAdmin && <EntryActions entryId={entry.id} username={username} showEdit={false} />}
        </div>
      </div>

      <CommentSection comments={comments} entryId={entry.id} session={session} />

      {showSignup && (
        <div className="mx-auto max-w-2xl px-4 sm:px-6 pb-16">
          <FollowWriterCard
            username={username}
            displayName={entry.author?.display_name || username}
            newsletterEnabled={!!entry.author?.newsletter_enabled}
            newsletterName={entry.author?.newsletter_name}
            onCustomDomain={onCustomDomain}
          />
        </div>
      )}
    </div>
  );
}
