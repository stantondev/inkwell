import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { requireSession } from "@/lib/require-session";
import { notFoundOrRethrow } from "@/lib/page-errors";
import { getToken } from "@/lib/session";
import { decodeEntities } from "@/lib/decode-entities";
import { songFrom, songLabel, resolveMusicEmbed } from "@/lib/music";
import { readingMinutes } from "@/lib/reading-time";
import { getCategoryLabel } from "@/lib/categories";
import { LocalDate, FULL_DATE } from "@/components/local-date";
import { AvatarWithFrame } from "@/components/avatar-with-frame";
import { ContentWarning } from "@/components/content-warning";
import { CurrentBlock } from "@/components/current-block";
import { EntryContent } from "@/components/entry-content";
import { GalleryHydrator } from "@/components/gallery-hydrator";
import { JournalPage } from "@/components/journal-page";
import { StickyNoteCard } from "@/components/sticky-note-card";
import type { JournalEntry } from "@/components/journal-entry-card";
import type { EntryData } from "@/app/[username]/[slug]/entry-types";
import { audienceSentence } from "@/app/[username]/[slug]/audience";
import { EntryCover, EntryMusicEmbed, EntryTags, getMoodHue } from "@/app/[username]/[slug]/entry-parts";
import styles from "@/app/[username]/[slug]/entry-page.module.css";

interface PreviewParams {
  params: Promise<{ id: string }>;
}

// Draft preview: the entry the way readers will see it, before it's published.
// Only the writer can open it (GET /api/entries/:id is the owner-only show_own).

async function loadEntry(id: string, token: string | null): Promise<EntryData> {
  try {
    const res = await apiFetch<{ data: EntryData }>(`/api/entries/${encodeURIComponent(id)}`, {}, token);
    return { ...res.data, title: res.data.title ? decodeEntities(res.data.title) : res.data.title };
  } catch (err) {
    notFoundOrRethrow(err);
  }
}

export async function generateMetadata({ params }: PreviewParams): Promise<Metadata> {
  const { id } = await params;
  let title = "Untitled";
  try {
    const token = await getToken();
    if (token) {
      const res = await apiFetch<{ data: EntryData }>(`/api/entries/${encodeURIComponent(id)}`, {}, token);
      if (res.data.title) title = decodeEntities(res.data.title);
    }
  } catch {
    /* the page itself handles errors */
  }
  return {
    title: `Preview: ${title}`,
    robots: { index: false, follow: false },
  };
}

export default async function PreviewPage({ params }: PreviewParams) {
  const { id } = await params;
  const { user, token } = await requireSession(`/preview/${id}`);
  const entry = await loadEntry(id, token);

  // Already out in the world: show the real page.
  if (entry.status === "published" && entry.slug) {
    redirect(`/${user.username}/${entry.slug}`);
  }

  // The name of a custom list, for the audience line.
  let listName: string | null = null;
  if (entry.privacy === "custom" && entry.custom_filter_id) {
    try {
      const filters = await apiFetch<{ data?: { id: string; name: string }[] }>("/api/filters", {}, token);
      listName = filters.data?.find((f) => f.id === entry.custom_filter_id)?.name ?? null;
    } catch {
      /* "your custom list" is fine */
    }
  }

  const isSticky = entry.kind === "sticky";
  const audience = audienceSentence({ privacy: entry.privacy, listName, circleName: entry.circle?.name ?? null });
  const scheduledAt = entry.scheduled_at ?? null;
  const author = entry.author ?? {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    avatar_url: user.avatar_url,
    bio: null,
    pronouns: null,
  };
  const frame = entry.author?.avatar_frame ?? user.avatar_frame;
  const animation = entry.author?.avatar_animation ?? user.avatar_animation;
  const tier = entry.author?.subscription_tier ?? user.subscription_tier;

  const banner = (
    <div className={styles.previewBanner} role="region" aria-label="Preview">
      <p className={styles.previewText}>
        <strong>Preview</strong> <span className={styles.previewMuted}>&mdash; only you can see this.</span>{" "}
        When it&rsquo;s published, it&rsquo;ll be {audience.charAt(0).toLowerCase() + audience.slice(1)}
        {scheduledAt && (
          <>
            {" "}
            <span className={styles.previewMuted}>
              Scheduled for <LocalDate
                iso={scheduledAt}
                // Spelled out: FULL_DATE comes from a client module, so on the
                // server it's a reference and spreading it gives nothing.
                options={{ weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }}
              />.
            </span>
          </>
        )}
      </p>
      <div className={styles.previewButtons}>
        {isSticky ? (
          <Link href="/drafts" className={styles.previewPrimary}>
            All drafts
          </Link>
        ) : (
          <>
            <Link href={`/editor?edit=${entry.id}`} className={styles.previewPrimary}>
              Back to editing
            </Link>
            <Link href="/drafts" className={styles.ownerButton}>
              All drafts
            </Link>
          </>
        )}
      </div>
    </div>
  );

  if (isSticky) {
    return (
      <div className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>
        {banner}
        <div className="mx-auto max-w-2xl px-4 sm:px-6 pt-10 pb-16">
          <div className="flex items-center gap-2.5 mb-6">
            <AvatarWithFrame
              url={author.avatar_url}
              name={author.display_name}
              size={36}
              frame={frame}
              animation={animation}
              subscriptionTier={tier ?? undefined}
            />
            <span className="min-w-0">
              <span className="block font-semibold truncate">{author.display_name}</span>
              <span className="block text-sm" style={{ color: "var(--muted)" }}>
                @{author.username} &middot; Not published yet
              </span>
            </span>
          </div>
          <StickyNoteCard
            entry={{ ...entry, author, stamps: [] } as unknown as JournalEntry}
            isOwn={false}
            variant="page"
          />
        </div>
      </div>
    );
  }

  const moodHue = getMoodHue(entry.mood_key, entry.mood);
  const wordCount = entry.word_count && entry.word_count > 0
    ? entry.word_count
    : (entry.body_html ?? "").replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length;
  const musicEmbed = resolveMusicEmbed(entry.music, entry.music_metadata);
  const listened = songFrom(entry.music, entry.music_metadata);
  const bodyHtml = entry.body_html ?? "";

  return (
    <div
      className="min-h-screen"
      style={{
        background: "var(--background)",
        color: "var(--foreground)",
        ...(moodHue !== null ? ({ "--mood-hue": String(moodHue) } as React.CSSProperties) : {}),
      }}
    >
      {banner}

      <div className={moodHue !== null ? "entry-ambient" : ""}>
        <div className="entry-wide px-4 sm:px-6 md:px-8 lg:px-12 pt-10 pb-12 relative">
          {/* Date */}
          {entry.published_at ? (
            <LocalDate
              iso={entry.published_at}
              options={FULL_DATE}
              className="block text-sm mb-5"
              style={{ color: "var(--muted)", letterSpacing: "0.01em" }}
            />
          ) : (
            <span className="block text-sm mb-5 italic" style={{ color: "var(--muted)", letterSpacing: "0.01em" }}>
              Not published yet
            </span>
          )}

          {entry.title && (
            <h1
              className="text-2xl sm:text-4xl font-bold leading-tight mb-7"
              style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
            >
              {entry.title}
            </h1>
          )}

          {/* Byline */}
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="flex items-center gap-2">
              {entry.userpic ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={entry.userpic.url} alt="" title={entry.userpic.keyword}
                  width={48} height={48} className="entry-userpic" />
              ) : (
                <AvatarWithFrame
                  url={author.avatar_url}
                  name={author.display_name}
                  size={26}
                  frame={frame}
                  animation={animation}
                  subscriptionTier={tier ?? undefined}
                />
              )}
              <span className="text-sm font-medium">{author.display_name}</span>
            </span>
            <span aria-hidden="true" style={{ color: "var(--border)" }}>·</span>
            <span className="text-sm" style={{ color: "var(--muted)" }}>
              {readingMinutes(wordCount)} min read
            </span>
            {entry.category && (
              <>
                <span aria-hidden="true" style={{ color: "var(--border)" }}>·</span>
                <span
                  className="text-sm px-2.5 py-1 rounded-full"
                  style={{ background: "var(--accent-light)", color: "var(--accent)" }}
                >
                  {getCategoryLabel(entry.category)}
                </span>
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
        </div>
      </div>

      <article className="entry-wide px-4 sm:px-6 md:px-8 lg:px-12 pb-16">
        <ContentWarning isSensitive={!!entry.is_sensitive} contentWarning={entry.content_warning}>
          {entry.cover_image_id && (
            <EntryCover imageId={entry.cover_image_id} alt={entry.title ?? "Entry cover"} />
          )}

          <JournalPage corner className="p-6 lg:p-10">
            {bodyHtml.trim() ? (
              <>
                <EntryContent
                  html={bodyHtml}
                  entryId={entry.id}
                  className={`prose-entry entry-body${entry.title ? " drop-cap" : ""}`}
                />
                <GalleryHydrator authorIsPlus={tier === "plus"} />
              </>
            ) : (
              <p className="italic" style={{ color: "var(--muted)" }}>
                Nothing written yet.
              </p>
            )}
          </JournalPage>

          {musicEmbed && entry.music && <EntryMusicEmbed embed={musicEmbed} music={entry.music} />}

          <EntryTags tags={entry.tags ?? []} />
        </ContentWarning>
      </article>
    </div>
  );
}
