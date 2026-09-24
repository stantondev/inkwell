import type { Metadata } from "next";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { getSession } from "@/lib/session";
import { LocalDate } from "@/components/local-date";
import { editionLabel } from "@/lib/gazette";

export const metadata: Metadata = {
  title: "Gazette editions",
  description: "Every edition of the Inkwell Gazette, morning and evening.",
  robots: { index: false, follow: true },
};

interface EditionRow {
  number: number;
  slot: string;
  published_at: string;
  story_count: number;
  lead: { title: string; provider_name: string | null; image_url: string | null } | null;
}

export default async function GazetteEditionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const [session, sp] = await Promise.all([getSession(), searchParams]);
  const page = Math.max(1, Number(sp.page) || 1);
  const res = await apiFetch<{ data: EditionRow[]; pagination: { total: number; per_page: number } }>(
    `/api/gazette/editions?page=${page}`,
    {},
    session?.token
  );
  const pages = Math.max(1, Math.ceil(res.pagination.total / res.pagination.per_page));

  return (
    <div className="gz">
      <header className="gz-masthead gz-masthead--small">
        <p className="gz-back">
          <Link href="/gazette">&larr; Today&rsquo;s paper</Link>
        </p>
        <h1 className="gz-title gz-title--small">Past editions</h1>
        <p className="gz-tagline">Every edition stays as it was printed.</p>
      </header>

      {res.data.length === 0 ? (
        <p className="gz-empty-line">No editions yet.</p>
      ) : (
        <ol className="gz-edition-list">
          {res.data.map((e) => (
            <li key={e.number}>
              <Link href={`/gazette/edition/${e.number}`} className="gz-edition-row">
                <span className="gz-edition-no">No. {e.number}</span>
                <span className="gz-edition-when">
                  <LocalDate iso={e.published_at} options={{ weekday: "short", month: "short", day: "numeric" }} asTime={false} />
                  {" · "}
                  {editionLabel(e.slot)}
                </span>
                <span className="gz-edition-lead">{e.lead?.title ?? `${e.story_count} stories`}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}

      {pages > 1 && (
        <nav className="gz-edition-nav" aria-label="Pages">
          {page > 1 ? <Link href={`/gazette/editions?page=${page - 1}`}>&larr; Newer</Link> : <span />}
          <span>
            Page {page} of {pages}
          </span>
          {page < pages ? <Link href={`/gazette/editions?page=${page + 1}`}>Older &rarr;</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
