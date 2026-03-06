import Link from "next/link";

interface Response {
  id: string;
  body: string;
  edited_at: string | null;
  inserted_at: string;
  author: { id: string; username: string; display_name: string; avatar_url: string | null } | null;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function ResponseCard({
  response: r,
  currentUserId,
  onDelete,
}: {
  response: Response;
  currentUserId: string;
  onDelete: () => void;
}) {
  const isOwn = r.author?.id === currentUserId;

  return (
    <div className="salon-response">
      {r.author?.avatar_url ? (
        <Link href={`/${r.author.username}`}>
          <img src={r.author.avatar_url} alt="" className="salon-response-avatar" />
        </Link>
      ) : (
        <div className="salon-response-avatar" style={{ background: "var(--salon-border)" }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
          {r.author && (
            <Link href={`/${r.author.username}`} style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--salon-foreground)", textDecoration: "none" }}>
              {r.author.display_name || r.author.username}
            </Link>
          )}
          <span style={{ fontSize: "0.75rem", color: "var(--salon-muted)" }}>
            {timeAgo(r.inserted_at)}
          </span>
          {r.edited_at && (
            <span style={{ fontSize: "0.6875rem", color: "var(--salon-muted)", fontStyle: "italic" }} title={`Edited ${new Date(r.edited_at).toLocaleString()}`}>
              (edited)
            </span>
          )}
        </div>

        <div
          className="prose-discussion"
          dangerouslySetInnerHTML={{ __html: r.body }}
        />

        {isOwn && (
          <button
            onClick={onDelete}
            style={{
              fontSize: "0.75rem",
              color: "var(--salon-muted)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              marginTop: "0.25rem",
            }}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
