import type { Metadata } from "next";
import Link from "next/link";

import { apiFetch } from "@/lib/api";
import { getRemoteEntry } from "@/lib/queries";
import { getSession, getToken } from "@/lib/session";
import { ContentWarning } from "@/components/content-warning";
import { EnrichableContent } from "./enrichable-content";
import { ShareButton } from "@/components/share-button";
import { TranslatableEntry, TranslatableTitle } from "@/components/translatable-entry";
import { SignupCta } from "@/components/signup-cta";
import { RefreshOnce } from "./refresh-once";
import { CommentSection } from "@/app/[username]/[slug]/comment-section";
import type { StampMark } from "@/components/stamp-config";
import { EntryStamps } from "@/app/[username]/[slug]/entry-stamps";
import { EntryDesk } from "@/app/[username]/[slug]/entry-desk";
import { EntryLetterhead, EntrySignoff } from "@/app/[username]/[slug]/entry-parts";
import { JournalPage } from "@/components/journal-page";
import { AvatarWithFrame } from "@/components/avatar-with-frame";
import { LocalDate, FULL_DATE } from "@/components/local-date";
import { readingMinutes } from "@/lib/reading-time";
import type { Comment } from "@/lib/comment-utils";
import { notFoundOrRethrow } from "@/lib/page-errors";
import { siteUrl } from "@/lib/site";

interface FediverseEntryParams {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; reply?: string }>;
}

interface RemoteEntryAuthor {
  username: string;
  display_name: string;
  avatar_url: string | null;
  domain: string;
  ap_id: string;
  profile_url: string;
}

interface RemoteEntryData {
  id: string;
  source: string;
  ap_id: string;
  url: string;
  title: string | null;
  body_html: string;
  tags: string[];
  published_at: string;
  author: RemoteEntryAuthor;
  stamps: string[];
  my_stamp: string | null;
  stamp_marks?: StampMark[];
  my_note?: string | null;
  my_stamped_on?: string | null;
  comment_count: number;
  ink_count: number;
  reprint_count: number;
  boosts_count: number;
  my_ink: boolean;
  my_reprint: boolean;
  sensitive: boolean;
  content_warning: string | null;
  is_sensitive: boolean;
}

/** Words in the post's text, for the reading time (fediverse posts carry no word count). */
function readingTime(html: string): number {
  return readingMinutes(html.replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length);
}

export async function generateMetadata({ params }: FediverseEntryParams): Promise<Metadata> {
  const { id } = await params;
  try {
    // Pass the same token the page component uses so react.cache() dedupes.
    const token = await getToken();
    const data = await getRemoteEntry<{ data: RemoteEntryData }>(id, token);
    const entry = data.data;
    const plainText = entry.body_html.replace(/<[^>]+>/g, "").slice(0, 160);
    const description = entry.title ? `${entry.title} — ${plainText}` : plainText;
    // The layout's title template adds "· Inkwell".
    const title = entry.title
      ? `${entry.title} · ${entry.author.display_name}`
      : `Post by ${entry.author.display_name}`;

    return {
      title,
      description,
      robots: { index: false, follow: true }, // Don't compete with original source in search
      openGraph: {
        title: entry.title ?? `Post by ${entry.author.display_name}`,
        description,
        url: entry.url,
        type: "article",
        publishedTime: entry.published_at,
      },
      twitter: {
        site: "@inkwellsocial",
        card: "summary",
        title: entry.title ?? `Post by ${entry.author.display_name}`,
        description,
      },
      alternates: {
        canonical: entry.url, // Canonical points to the original source
      },
    };
  } catch {
    return { title: "Fediverse Post" };
  }
}

export default async function FediverseEntryPage({ params, searchParams }: FediverseEntryParams) {
  const { id } = await params;
  const { from, reply } = await searchParams;
  const token = await getToken();
  const session = await getSession();

  const cameFromGazette = from === "gazette";
  const cameFromMention = from === "mention";
  const backHref = cameFromGazette ? "/gazette" : cameFromMention ? "/notifications" : "/explore?source=fediverse";
  const backLabel = cameFromGazette ? "The Gazette" : cameFromMention ? "Notifications" : "Explore";

  let entry: RemoteEntryData;
  let enrichingPreview = false;
  try {
    // Cached — generateMetadata above already fetched this with the same token.
    const data = await getRemoteEntry<{ data: RemoteEntryData; enriching_preview?: boolean }>(id, token);
    entry = data.data;
    enrichingPreview = data.enriching_preview ?? false;
  } catch (err) {
    notFoundOrRethrow(err);
  }

  // Fetch comments. `fetching`: the replies are being read from the post's
  // home server right now; the page refreshes once to show them.
  let comments: Comment[] = [];
  let repliesFetching = false;
  try {
    const data = await apiFetch<{ data: Comment[]; fetching?: boolean }>(`/api/remote-entries/${id}/comments`, {}, token);
    comments = data.data ?? [];
    repliesFetching = data.fetching === true;
  } catch {
    // show empty
  }

  const author = entry.author;
  const mins = readingTime(entry.body_html);
  const domain = author.domain || new URL(entry.url || entry.ap_id).hostname;
  const originalUrl = entry.url || entry.ap_id;
  const handle = `@${author.username}@${domain}`;
  const authorName = author.display_name || author.username;

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
      {/* ── Above the page: the way back, and sharing ── */}
      <div className="entry-wide px-4 sm:px-6 md:px-8 lg:px-12 pt-8 pb-5">
        <div className="flex items-center justify-between gap-3">
          <Link
            href={backHref}
            className="text-sm transition-colors hover:underline flex items-center gap-1.5"
            style={{ color: "var(--muted)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            {backLabel}
          </Link>
          <ShareButton
            url={siteUrl(`/fediverse/${entry.id}`)}
            title={entry.title || `Post by ${authorName}`}
            size={18}
          />
        </div>
      </div>

      {/* ── The post, set like a letter that came from abroad: airmail
          edge, the writer's server as the return address, a link home. ── */}
      <article className="entry-wide px-4 sm:px-6 md:px-8 lg:px-12 pb-16">
        <JournalPage corner className="entry-letter entry-letter--abroad p-6 lg:p-10">
          <EntryLetterhead
            date={<LocalDate iso={entry.published_at} options={FULL_DATE} />}
            corner={
              <EntryStamps
                entryId={entry.id}
                initialStamps={entry.stamps ?? []}
                initialMyStamp={entry.my_stamp ?? null}
                initialMarks={entry.stamp_marks ?? null}
                initialNote={entry.my_note === undefined ? undefined : entry.my_note}
                initialStampedOn={entry.my_stamped_on ?? null}
                writerName={authorName}
                isOwnEntry={false}
                isLoggedIn={!!session}
                isPlus={session?.user.subscription_tier === "plus"}
                stampApiPath={`/api/remote-entries/${entry.id}/stamp`}
                showPicker={false}
              />
            }
            title={entry.title ? <TranslatableTitle id={entry.id}>{entry.title}</TranslatableTitle> : undefined}
            from={
              <a href={author.profile_url} target="_blank" rel="noopener noreferrer" className="entry-from-writer">
                <AvatarWithFrame url={author.avatar_url} name={authorName} size={26} />
                <span>{authorName}</span>
              </a>
            }
            details={
              <>
                <span aria-hidden="true" className="entry-from-sep">·</span>
                <span className="entry-from-detail">{mins === 1 ? "a minute's read" : `${mins} minutes' read`}</span>
                <span aria-hidden="true" className="entry-from-sep">·</span>
                <a href={originalUrl} target="_blank" rel="noopener noreferrer"
                  className="entry-from-abroad" title={`Posted on ${domain}. Opens there.`}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10"/><path d="M2 12h20"/>
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                  </svg>
                  {domain}
                </a>
              </>
            }
          />

          <ContentWarning isSensitive={entry.is_sensitive} contentWarning={entry.content_warning}>
            <TranslatableEntry
              type="remote_entry"
              id={entry.id}
              originalBodyHtml={entry.body_html}
              preferredLanguage={session?.user.preferred_language}
              isLoggedIn={!!session}
              loginHref={`/login?next=${encodeURIComponent(`/fediverse/${entry.id}`)}`}
            >
              <EnrichableContent
                entryId={entry.id}
                initialHtml={entry.body_html}
                enriching={enrichingPreview}
              />
            </TranslatableEntry>

            <EntrySignoff name={authorName} from={handle} />

            {entry.tags.length > 0 && (
              <div className="entry-tags flex flex-wrap gap-2">
                {entry.tags.map((tag) => (
                  <Link
                    key={tag}
                    href={`/tag/${encodeURIComponent(tag)}`}
                    className="text-xs px-3 py-1.5 rounded-full border transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                    style={{ borderColor: "var(--border)", color: "var(--muted)" }}
                  >
                    #{tag}
                  </Link>
                ))}
              </div>
            )}
          </ContentWarning>
        </JournalPage>

        <EntryDesk
          entryId={entry.id}
          username={author.username}
          writerName={authorName}
          isOwnEntry={false}
          isLoggedIn={!!session}
          isPlus={session?.user.subscription_tier === "plus"}
          isPublic={true}
          footnoteCount={comments.length}
          inked={entry.my_ink ?? false}
          inkCount={entry.ink_count ?? 0}
          reprinted={entry.my_reprint ?? false}
          reprintCount={entry.reprint_count ?? 0}
          myStamp={entry.my_stamp ?? null}
          myNote={entry.my_note === undefined ? undefined : entry.my_note}
          myStampedOn={entry.my_stamped_on ?? null}
          stampMarks={entry.stamp_marks ?? null}
          share={{
            url: siteUrl(`/fediverse/${entry.id}`),
            title: entry.title || `Post by ${authorName}`,
            description: "",
          }}
          remote={{
            inkApiPath: `/api/remote-entries/${entry.id}/ink`,
            reprintApiPath: `/api/remote-entries/${entry.id}/reprint/toggle`,
            stampApiPath: `/api/remote-entries/${entry.id}/stamp`,
            note: (
              <>
                This post lives on {domain}. Footnotes you leave here go to {authorName} there as replies.{" "}
                <a href={originalUrl} target="_blank" rel="noopener noreferrer" className="entry-desk-out">
                  Read it on {domain} &rarr;
                </a>
              </>
            ),
          }}
        />
      </article>

      {/* Footnotes: replies from the post's home server and from Inkwell */}
      {repliesFetching && <RefreshOnce />}
      <CommentSection
        entryId={entry.id}
        comments={comments}
        session={session ? { user: { id: session.user.id, username: session.user.username, is_admin: session.user.is_admin } } : null}
        commentApiPath={`/api/remote-entries/${entry.id}/comments`}
        autoFocus={reply === "1" && !!session}
      />

      {/* Signup CTA for logged-out users */}
      {!session && (
        <div className="entry-wide px-4 sm:px-6 md:px-8 lg:px-12 pb-16">
          <SignupCta />
        </div>
      )}
    </div>
  );
}
