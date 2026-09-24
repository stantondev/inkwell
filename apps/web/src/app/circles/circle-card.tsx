import Link from "next/link";
import { CATEGORY_LABELS, timeAgo, type Circle } from "./circle-types";

function isRecentlyActive(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return Date.now() - new Date(dateStr).getTime() < 24 * 60 * 60 * 1000;
}

export default function CircleCard({ circle }: { circle: Circle }) {
  return (
    <Link href={`/circles/${circle.slug}`} style={{ textDecoration: "none" }}>
      <div className="circle-card" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
          <h3 style={{
            fontFamily: "var(--font-lora, Georgia, serif)",
            fontSize: "1.0625rem",
            fontWeight: 600,
            color: "var(--foreground)",
            margin: 0,
            lineHeight: 1.3,
            flex: 1,
          }}>
            {circle.name}
          </h3>
          {circle.is_starter && (
            <span style={{ fontSize: "0.625rem", color: "var(--accent)", fontWeight: 600, whiteSpace: "nowrap", marginLeft: "0.5rem" }}>
              STARTER
            </span>
          )}
        </div>

        <span className="circle-category-pill" style={{ alignSelf: "flex-start", marginBottom: "0.5rem" }}>
          {CATEGORY_LABELS[circle.category] || circle.category}
        </span>

        {circle.description && (
          <p style={{
            fontSize: "0.8125rem",
            color: "var(--muted)",
            lineHeight: 1.5,
            marginBottom: "0.75rem",
            flex: 1,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}>
            {circle.description.replace(/<[^>]*>/g, "").slice(0, 150)}
          </p>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.75rem", color: "var(--muted)", marginTop: "auto" }}>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <span>{circle.member_count} member{circle.member_count !== 1 ? "s" : ""}</span>
            <span>{circle.entry_count ?? 0} post{(circle.entry_count ?? 0) !== 1 ? "s" : ""}</span>
          </div>
          {circle.last_activity_at && (circle.entry_count ?? 0) > 0 && (
            <span suppressHydrationWarning style={isRecentlyActive(circle.last_activity_at) ? { color: "var(--accent)", fontWeight: 500 } : undefined}>
              {isRecentlyActive(circle.last_activity_at) && <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", marginRight: "0.25rem", verticalAlign: "middle" }} />}
              {timeAgo(circle.last_activity_at)}
            </span>
          )}
        </div>

        {circle.owner && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", marginTop: "0.5rem", fontSize: "0.75rem", color: "var(--muted)" }}>
            {circle.owner.avatar_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={circle.owner.avatar_url}
                alt=""
                style={{ width: 16, height: 16, borderRadius: "50%", objectFit: "cover" }}
              />
            )}
            <span>started by {circle.owner.display_name || circle.owner.username}</span>
          </div>
        )}
      </div>
    </Link>
  );
}
