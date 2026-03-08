import Link from "next/link";

interface Member {
  id: string;
  role: string;
  user: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    avatar_frame: string | null;
  } | null;
}

export default function MemberStrip({
  members,
  totalCount,
  circleId,
  isMember,
}: {
  members: Member[];
  totalCount: number;
  circleId: string;
  isMember: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
      <div className="circle-member-strip">
        {members.map((m) =>
          m.user ? (
            <Link key={m.id} href={`/${m.user.username}`} title={`${m.user.display_name || m.user.username}${m.role === "owner" ? " (Owner)" : m.role === "moderator" ? " (Mod)" : ""}`} className="circle-member-avatar-wrap">
              <img
                className="circle-member-avatar"
                src={m.user.avatar_url || `/api/avatars/${m.user.username}`}
                alt={m.user.display_name || m.user.username}
              />
              {m.role === "owner" && <span className="circle-role-dot circle-role-dot--owner" />}
              {m.role === "moderator" && <span className="circle-role-dot circle-role-dot--mod" />}
            </Link>
          ) : null
        )}
      </div>
      <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
        {totalCount} member{totalCount !== 1 ? "s" : ""}
      </span>
    </div>
  );
}
