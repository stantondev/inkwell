import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getRemoteEntry } from "@/lib/queries";
import { getSession, getToken } from "@/lib/session";
import { ContentWarning } from "@/components/content-warning";
import { EnrichableContent } from "./enrichable-content";
import { InkButton } from "@/components/ink-button";
import { ReprintButton } from "@/components/reprint-button";
import { ShareButton } from "@/components/share-button";
import { TranslateButton } from "@/components/translate-button";
import { SignupCta } from "@/components/signup-cta";
import { CommentSection } from "@/app/[username]/[slug]/comment-section";
import { EntryStamps } from "@/app/[username]/[slug]/entry-stamps";
import type { Comment } from "@/lib/comment-utils";

interface FediverseEntryParams {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}

function readingTime(html: string): number {
  const words = html.replace(/<[^>]+>/g, "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
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
    const title = entry.title
      ? `${entry.title} · ${entry.author.display_name} · Inkwell`
      : `Post by ${entry.author.display_name} · Inkwell`;

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
    return { title: "Fediverse Post · Inkwell" };
  }
}

export default async function FediverseEntryPage({ params, searchParams }: FediverseEntryParams) {
  const { id } = await params;
  const { from } = await searchParams;
  const token = await getToken();
  const session = await getSession();

  const cameFromGazette = from === "gazette";
  const backHref = cameFromGazette ? "/gazette" : "/explore?source=fediverse";
  const backLabel = cameFromGazette ? "The Gazette" : "Explore";

  let entry: RemoteEntryData;
  let enrichingPreview = false;
  try {
    // Cached — generateMetadata above already fetched this with the same token.
    const data = await getRemoteEntry<{ data: RemoteEntryData; enriching_preview?: boolean }>(id, token);
    entry = data.data;
    enrichingPreview = data.enriching_preview ?? false;
  } catch {
    notFound();
  }

  // Fetch comments
  let comments: Comment[] = [];
  try {
    const data = await apiFetch<{ data: Comment[] }>(`/api/remote-entries/${id}/comments`, {}, token);
    comments = data.data ?? [];
  } catch {
    // show empty
  }

  const author = entry.author;
  const mins = readingTime(entry.body_html);
  const domain = author.domain || new URL(entry.url || entry.ap_id).hostname;

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
      <div className="entry-wide px-4 sm:px-6 md:px-8 lg:px-12 pt-10 pb-12 relative">

        {/* Stamps — top-right */}
        <div className="flex justify-end mb-3 sm:mb-0 sm:absolute sm:top-8 sm:right-6 md:right-8 lg:right-12 z-10">
          <EntryStamps
            entryId={entry.id}
            initialStamps={entry.stamps ?? []}
            initialMyStamp={entry.my_stamp ?? null}
            isOwnEntry={false}
            isLoggedIn={!!session}
            isPlus={session?.user.subscription_tier === "plus"}
            stampApiPath={`/api/remote-entries/${entry.id}/stamp`}
          />
        </div>

        {/* Nav row — context-aware back link */}
        <div className="flex flex-col gap-3 mb-6">
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

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            <InkButton
              entryId={entry.id}
              initialInked={entry.my_ink ?? false}
              initialCount={entry.ink_count ?? 0}
              isOwnEntry={false}
              isLoggedIn={!!session}
              size={18}
              apiPath={`/api/remote-entries/${entry.id}/ink`}
            />
            <ReprintButton
              entryId={entry.id}
              initialReprinted={entry.my_reprint ?? false}
              initialCount={entry.reprint_count ?? 0}
              isOwnEntry={false}
              isLoggedIn={!!session}
              isRemote={true}
              size={18}
              apiPath={`/api/remote-entries/${entry.id}/reprint/toggle`}
            />
            {session && (
              <TranslateButton
                type="remote_entry"
                id={entry.id}
                preferredLanguage={session.user.preferred_language}
                size={18}
              />
            )}
            <ShareButton
              url={`https://inkwell.social/fediverse/${entry.id}`}
              title={entry.title || `Post by ${author.display_name}`}
              size={15}
            />
          </div>
        </div>

        {/* Author row */}
        <div className="flex items-center gap-3 mb-6">
          <a href={author.profile_url} target="_blank" rel="noopener noreferrer">
            {author.avatar_url ? (
              <img
                src={author.avatar_url}
                alt={author.display_name}
                width={48}
                height={48}
                className="rounded-full object-cover"
                style={{ width: 48, height: 48 }}
              />
            ) : (
              <div
                className="rounded-full flex items-center justify-center text-lg font-bold"
                style={{ width: 48, height: 48, background: "var(--surface)", color: "var(--muted)" }}
              >
                {(author.display_name || author.username)[0]?.toUpperCase()}
              </div>
            )}
          </a>
          <div>
            <a
              href={author.profile_url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold hover:underline"
              style={{ color: "var(--foreground)" }}
            >
              {author.display_name}
            </a>
            <div className="flex items-center gap-1.5 text-sm" style={{ color: "var(--muted)" }}>
              <span>🌐</span>
              <span>@{author.username}@{domain}</span>
              <span>·</span>
              <time dateTime={entry.published_at} className="italic" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
                {formatDate(entry.published_at)}
              </time>
            </div>
          </div>
        </div>

        {/* Reading time */}
        <div className="mb-6 text-sm italic" style={{ color: "var(--muted)", fontFamily: "var(--font-lora, Georgia, serif)" }}>
          {mins} min read
          {entry.boosts_count > 0 && (
            <span> · {entry.boosts_count} boost{entry.boosts_count !== 1 ? "s" : ""}</span>
          )}
        </div>

        {/* Title */}
        {entry.title && (
          <h1
            className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-6 leading-tight"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            {entry.title}
          </h1>
        )}

        {/* Content */}
        <ContentWarning isSensitive={entry.is_sensitive} contentWarning={entry.content_warning}>
          <EnrichableContent
            entryId={entry.id}
            initialHtml={entry.body_html}
            enriching={enrichingPreview}
          />

          {/* Tags */}
          {entry.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-10 pt-8 border-t" style={{ borderColor: "var(--border)" }}>
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

        {/* View on original source */}
        <div className="mt-8 pt-6 border-t" style={{ borderColor: "var(--border)" }}>
          <a
            href={entry.url || entry.ap_id}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:opacity-80"
            style={{ background: "var(--surface)", color: "var(--accent)", border: "1px solid var(--border)" }}
          >
            <span>🌐</span>
            View on {domain} →
          </a>
        </div>

        {/* Divider before comments */}
        <hr className="my-10" style={{ borderColor: "var(--border)" }} />

        {/* Comments (Marginalia) */}
        <CommentSection
          entryId={entry.id}
          comments={comments}
          session={session ? { user: { id: session.user.id, username: session.user.username, is_admin: session.user.is_admin } } : null}
          commentApiPath={`/api/remote-entries/${entry.id}/comments`}
        />

        {/* Signup CTA for logged-out users */}
        {!session && <SignupCta />}
      </div>
    </div>
  );
}
