import Link from "next/link";
import { Avatar } from "@/components/avatar-with-frame";

interface SearchEntry {
  id: string;
  slug: string;
  title: string | null;
  body_html: string;
  published_at: string;
  author: {
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

interface EntryResultsProps {
  entries: SearchEntry[];
  query: string;
  hasSearched: boolean;
}

export function EntryResults({ entries, query, hasSearched }: EntryResultsProps) {
  if (entries.length === 0 && hasSearched && query.trim()) {
    return (
      <div className="catalog-no-results">
        <p className="catalog-no-results-title">
          No cards filed under &ldquo;{query}&rdquo;
        </p>
        <p className="catalog-no-results-text">
          Try a different search term or broader topic.
        </p>
      </div>
    );
  }

  if (entries.length === 0) return null;

  return (
    <div className="catalog-results">
      {entries.map((entry) => (
        <Link
          key={entry.id}
          href={`/${entry.author.username}/${entry.slug}`}
          className="catalog-card catalog-card-entry"
        >
          <div className="catalog-entry-author">
            <Avatar url={entry.author.avatar_url} name={entry.author.display_name} size={20} />
            <span className="catalog-entry-author-text">
              {entry.author.display_name} · {formatDate(entry.published_at)}
            </span>
          </div>
          {entry.title && (
            <p className="catalog-entry-title">{entry.title}</p>
          )}
          <div
            className="catalog-entry-excerpt"
            dangerouslySetInnerHTML={{ __html: entry.body_html }}
          />
        </Link>
      ))}
    </div>
  );
}
