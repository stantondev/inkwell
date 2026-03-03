import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/session";
import { getCategoryLabel, getCategorySlug } from "@/lib/categories";
import { decodeEntities } from "@/lib/decode-entities";

interface SeriesPageParams {
  params: Promise<{ username: string; slug: string }>;
}

interface SeriesAuthor {
  username: string;
  display_name: string;
  avatar_url: string | null;
}

interface SeriesEntry {
  id: string;
  title: string | null;
  slug: string;
  excerpt: string | null;
  series_order: number;
  published_at: string;
  word_count: number;
  cover_image_id: string | null;
  category: string | null;
  mood: string | null;
}

interface SeriesData {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  cover_image_id: string | null;
  status: "ongoing" | "completed";
  entry_count: number;
  author: SeriesAuthor;
  entries: SeriesEntry[];
  created_at: string;
  updated_at: string;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
}

export async function generateMetadata({ params }: SeriesPageParams): Promise<Metadata> {
  const { username, slug } = await params;
  const token = await getToken();

  try {
    const data = await apiFetch<{ data: SeriesData }>(
      `/api/users/${username}/series/${slug}`, {}, token
    );
    const series = data.data;
    return {
      title: `${series.title} — @${username} on Inkwell`,
      description: series.description || `A series of ${series.entry_count} entries by @${username}`,
      ...(series.cover_image_id
        ? { openGraph: { images: [`/api/images/${series.cover_image_id}`] } }
        : {}),
    };
  } catch {
    return { title: "Series — Inkwell" };
  }
}

export default async function SeriesPage({ params }: SeriesPageParams) {
  const { username, slug } = await params;
  const token = await getToken();

  let series: SeriesData;
  try {
    const data = await apiFetch<{ data: SeriesData }>(
      `/api/users/${username}/series/${slug}`, {}, token
    );
    series = data.data;
  } catch {
    notFound();
  }

  const author = series.author;

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
      {/* Cover image */}
      {series.cover_image_id && (
        <div className="w-full overflow-hidden" style={{ maxHeight: 300 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/images/${series.cover_image_id}`}
            alt={series.title}
            className="w-full object-cover"
            style={{ maxHeight: 300 }}
            loading="eager"
          />
        </div>
      )}

      <div className="mx-auto max-w-2xl px-4 py-10">
        {/* Back link */}
        <Link
          href={`/${username}`}
          className="text-sm transition-colors hover:underline flex items-center gap-1.5 mb-8"
          style={{ color: "var(--muted)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
          @{username}
        </Link>

        {/* Series header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <h1
              className="text-2xl font-semibold"
              style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
            >
              {series.title}
            </h1>
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0"
              style={{
                background: series.status === "completed" ? "var(--accent-light)" : "var(--surface-hover, var(--border))",
                color: series.status === "completed" ? "var(--accent)" : "var(--muted)",
              }}
            >
              {series.status === "completed" ? "Completed" : "Ongoing"}
            </span>
          </div>

          {series.description && (
            <p className="text-sm leading-relaxed mb-3" style={{ color: "var(--muted)" }}>
              {series.description}
            </p>
          )}

          <div className="flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
            <Link href={`/${username}`} className="hover:underline">
              by {author.display_name}
            </Link>
            <span aria-hidden="true" style={{ color: "var(--border)" }}>·</span>
            <span>{series.entry_count} {series.entry_count === 1 ? "entry" : "entries"}</span>
          </div>
        </div>

        {/* Entry list */}
        {series.entries.length === 0 ? (
          <div
            className="rounded-xl border p-8 text-center"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              No entries in this series yet.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {series.entries.map((entry, index) => {
              const mins = entry.word_count ? Math.max(1, Math.round(entry.word_count / 200)) : 1;

              return (
                <Link
                  key={entry.id}
                  href={`/${username}/${entry.slug}`}
                  className="block rounded-xl border p-5 transition-colors hover:border-[var(--accent)]"
                  style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                >
                  <div className="flex items-start gap-4">
                    {/* Part number */}
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-semibold"
                      style={{ background: "var(--accent-light)", color: "var(--accent)" }}
                    >
                      {index + 1}
                    </div>

                    <div className="min-w-0 flex-1">
                      <h2 className="text-base font-medium mb-1" style={{ color: "var(--foreground)" }}>
                        {entry.title || "Untitled"}
                      </h2>

                      {entry.excerpt && (
                        <p className="text-sm line-clamp-2 mb-2" style={{ color: "var(--muted)" }}>
                          {decodeEntities(entry.excerpt)}
                        </p>
                      )}

                      <div className="flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
                        <span>{formatDate(entry.published_at)}</span>
                        <span aria-hidden="true" style={{ color: "var(--border)" }}>·</span>
                        <span>{mins} min read</span>
                        {entry.category && (
                          <>
                            <span aria-hidden="true" style={{ color: "var(--border)" }}>·</span>
                            <span
                              className="px-1.5 py-0.5 rounded-full"
                              style={{ background: "var(--accent-light)", color: "var(--accent)" }}
                            >
                              {getCategoryLabel(entry.category)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Cover image thumbnail */}
                    {entry.cover_image_id && (
                      <div className="hidden sm:block w-20 h-16 rounded-lg overflow-hidden shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/images/${entry.cover_image_id}`}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
