import { useRef, useEffect, useState } from "react";
import type { MentionUser } from "@/hooks/use-mention-autocomplete";

interface MentionDropdownProps {
  users: MentionUser[];
  activeIndex: number;
  onSelect: (user: MentionUser) => void;
  position?: "above" | "below";
}

export function MentionDropdown({
  users,
  activeIndex,
  onSelect,
  position = "above",
}: MentionDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  // Flip position if dropdown would be clipped by viewport (especially with virtual keyboard)
  useEffect(() => {
    const el = dropdownRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vh = window.visualViewport?.height ?? window.innerHeight;

    if (position === "above" && rect.top < 0) {
      setAdjustedPosition("below");
    } else if (position === "below" && rect.bottom > vh) {
      setAdjustedPosition("above");
    } else {
      setAdjustedPosition(position);
    }
  }, [users, position]);

  const posStyle =
    adjustedPosition === "above"
      ? { bottom: "100%", marginBottom: "4px" }
      : { top: "100%", marginTop: "4px" };

  return (
    <div
      ref={dropdownRef}
      className="mention-dropdown absolute left-0 right-0 z-50 rounded-lg border shadow-lg overflow-hidden"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
        maxHeight: "min(200px, 40dvh)",
        overflowY: "auto",
        ...posStyle,
      }}
    >
      {users.map((user, i) => (
        <button
          key={user.id}
          type="button"
          onClick={() => onSelect(user)}
          className="mention-dropdown-item w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors"
          style={{
            background:
              i === activeIndex
                ? "var(--accent-light, rgba(45, 74, 138, 0.1))"
                : "transparent",
          }}
        >
          <div
            className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-medium"
            style={{
              background: user.avatar_url ? undefined : "var(--accent)",
              color: user.avatar_url ? undefined : "#fff",
              backgroundImage: user.avatar_url
                ? `url(${user.avatar_url})`
                : undefined,
              backgroundSize: "cover",
            }}
          >
            {!user.avatar_url &&
              (user.display_name?.[0] || user.username[0]).toUpperCase()}
          </div>
          <div className="min-w-0">
            <span className="font-medium">
              {user.display_name || user.username}
            </span>
            <span className="ml-1.5" style={{ color: "var(--muted)" }}>
              @{user.username}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
