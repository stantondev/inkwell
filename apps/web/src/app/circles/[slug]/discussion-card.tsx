import Link from "next/link";

interface Discussion {
  id: string;
  title: string;
  is_prompt: boolean;
  is_pinned: boolean;
  is_locked: boolean;
  response_count: number;
  last_response_at: string | null;
  inserted_at: string;
  author: { id: string; username: string; display_name: string; avatar_url: string | null } | null;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
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

export default function DiscussionCard({ discussion: d, circleSlug }: { discussion: Discussion; circleSlug: string }) {
  return (
    <Link href={`/circles/${circleSlug}/${d.id}`} style={{ textDecoration: "none" }}>
      <div className={`circle-discussion-card ${d.is_prompt ? "circle-prompt" : ""}`}>
        {d.author?.avatar_url && (
          <img
            src={d.author.avatar_url}
            alt=""
            style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", flexWrap: "wrap" }}>
            {d.is_prompt && <span className="circle-prompt-label">Circle Prompt</span>}
            {d.is_pinned && <span style={{ fontSize: "0.6875rem", color: "var(--muted)" }}>📌</span>}
            {d.is_locked && <span className="circle-locked-badge">🔒 Locked</span>}
          </div>
          <h3 style={{
            fontFamily: "var(--font-lora, Georgia, serif)",
            fontSize: "0.9375rem",
            fontWeight: 600,
            color: "var(--foreground)",
            margin: "0.125rem 0",
            lineHeight: 1.4,
          }}>
            {d.title}
          </h3>
          <div style={{ display: "flex", gap: "0.625rem", fontSize: "0.75rem", color: "var(--muted)" }}>
            {d.author && <span>{d.author.display_name || d.author.username}</span>}
            <span>{d.response_count} response{d.response_count !== 1 ? "s" : ""}</span>
            <span>{timeAgo(d.last_response_at || d.inserted_at)}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
