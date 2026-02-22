"use client";

import { useState, useEffect, useRef } from "react";
import { STAMP_CONFIG } from "./stamp-config";

interface StampUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

interface StampPopoverProps {
  entryId: string;
  stamps: string[];
  isAuthor: boolean;
}

export function StampPopover({ entryId, stamps, isAuthor }: StampPopoverProps) {
  const [activeStamp, setActiveStamp] = useState<string | null>(null);
  const [stampedBy, setStampedBy] = useState<Record<string, StampUser[]> | null>(null);
  const [loaded, setLoaded] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Load stamp details when author first interacts
  useEffect(() => {
    if (!isAuthor || loaded || !activeStamp) return;

    async function load() {
      try {
        const res = await fetch(`/api/entries/${entryId}/stamps`);
        if (res.ok) {
          const { data } = await res.json();
          setStampedBy(data.stamped_by ?? {});
        }
      } catch {
        // silently fail
      }
      setLoaded(true);
    }
    load();
  }, [isAuthor, loaded, activeStamp, entryId]);

  // Close popover on outside click
  useEffect(() => {
    if (!activeStamp) return;
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setActiveStamp(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [activeStamp]);

  if (!stamps || stamps.length === 0) return null;

  return (
    <div ref={popoverRef} className="flex items-center gap-1.5 relative" aria-label="Stamps on this entry">
      {stamps.map((stampType) => {
        const config = STAMP_CONFIG[stampType];
        if (!config) return null;

        const isSupporter = stampType === "supporter";

        return (
          <button
            key={stampType}
            onClick={() => isAuthor && setActiveStamp(activeStamp === stampType ? null : stampType)}
            className={`flex-shrink-0 stamp-impression transition-transform hover:scale-110${isSupporter ? " stamp-supporter-shimmer" : ""}`}
            style={{
              cursor: isAuthor ? "pointer" : "default",
              width: 36,
              height: 36,
            }}
            title={isAuthor ? `${config.label} — click to see who` : config.description}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={config.icon}
              alt={config.label}
              width={36}
              height={36}
              style={{ width: 36, height: 36 }}
            />
          </button>
        );
      })}

      {/* Author-only popover showing who left the active stamp type */}
      {activeStamp && isAuthor && (
        <div
          className="absolute right-0 top-full mt-2 z-50 rounded-xl border p-3 shadow-lg"
          style={{
            background: "var(--surface)",
            borderColor: "var(--border)",
            minWidth: 180,
          }}
        >
          <p className="text-xs font-medium mb-2" style={{ color: "var(--muted)" }}>
            {STAMP_CONFIG[activeStamp]?.label}
          </p>
          {!stampedBy ? (
            <p className="text-xs" style={{ color: "var(--muted)" }}>Loading...</p>
          ) : (stampedBy[activeStamp] ?? []).length === 0 ? (
            <p className="text-xs" style={{ color: "var(--muted)" }}>No stamps yet</p>
          ) : (
            <div className="flex flex-col gap-2">
              {(stampedBy[activeStamp] ?? []).map((user) => (
                <a
                  key={user.id}
                  href={`/${user.username}`}
                  className="flex items-center gap-2 text-sm hover:underline"
                >
                  {user.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={user.avatar_url}
                      alt={user.display_name}
                      width={20}
                      height={20}
                      className="rounded-full object-cover"
                      style={{ width: 20, height: 20 }}
                    />
                  ) : (
                    <div
                      className="rounded-full flex items-center justify-center text-[8px] font-semibold"
                      style={{
                        width: 20,
                        height: 20,
                        background: "var(--accent-light)",
                        color: "var(--accent)",
                      }}
                    >
                      {user.display_name[0]?.toUpperCase()}
                    </div>
                  )}
                  <span className="text-sm">{user.display_name}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
