"use client";

import { useState, useRef, useEffect } from "react";
import { STAMP_CONFIG, STAMP_TYPES } from "./stamp-config";
import { FloatingPopup } from "./floating-popup";

interface StampPickerProps {
  entryId: string;
  currentStamp: string | null;
  isOwnEntry: boolean;
  isLoggedIn: boolean;
  isPlus: boolean;
  /** Compact mode for feed cards — shows just an icon button */
  compact?: boolean;
  onStampChange?: (stamps: string[], myStamp: string | null) => void;
}

export function StampPicker({
  entryId,
  currentStamp,
  isOwnEntry,
  isLoggedIn,
  isPlus,
  compact = false,
  onStampChange,
}: StampPickerProps) {
  const [open, setOpen] = useState(false);
  const [myStamp, setMyStamp] = useState<string | null>(currentStamp);
  const [loading, setLoading] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMyStamp(currentStamp);
  }, [currentStamp]);

  if (isOwnEntry) return null;

  function handleToggle() {
    if (!isLoggedIn) {
      window.location.href = "/login";
      return;
    }
    setOpen(!open);
  }

  async function handleStamp(stampType: string) {
    if (loading) return;

    // If clicking the same stamp, remove it
    if (myStamp === stampType) {
      setLoading(true);
      const prev = myStamp;
      setMyStamp(null);

      try {
        const res = await fetch(`/api/entries/${entryId}/stamp`, { method: "DELETE" });
        if (res.ok) {
          const { data } = await res.json();
          onStampChange?.(data.stamps, null);
        } else {
          setMyStamp(prev);
        }
      } catch {
        setMyStamp(prev);
      } finally {
        setLoading(false);
        setOpen(false);
      }
      return;
    }

    // Set new stamp
    setLoading(true);
    const prev = myStamp;
    setMyStamp(stampType);

    try {
      const res = await fetch(`/api/entries/${entryId}/stamp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stamp_type: stampType }),
      });
      if (res.ok) {
        const { data } = await res.json();
        onStampChange?.(data.stamps, data.stamp_type);
      } else {
        setMyStamp(prev);
      }
    } catch {
      setMyStamp(prev);
    } finally {
      setLoading(false);
      setOpen(false);
    }
  }

  const stampList = (
    <>
      <p className="text-xs font-medium mb-2.5" style={{ color: "var(--muted)" }}>
        Choose a stamp
      </p>
      <div className="flex flex-col gap-1">
        {STAMP_TYPES.map((type) => {
          const config = STAMP_CONFIG[type];
          const isDisabled = config.plusOnly && !isPlus;
          const isActive = myStamp === type;

          return (
            <button
              key={type}
              onClick={() => !isDisabled && handleStamp(type)}
              disabled={isDisabled || loading}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors"
              style={{
                background: isActive ? "var(--accent-light)" : "transparent",
                color: isDisabled ? "var(--muted)" : "var(--foreground)",
                opacity: isDisabled ? 0.5 : 1,
                cursor: isDisabled ? "not-allowed" : loading ? "wait" : "pointer",
              }}
              title={isDisabled ? "Plus subscription required" : config.description}
            >
              <div
                className={`flex-shrink-0${type === "supporter" && !isDisabled ? " stamp-supporter-shimmer" : ""}`}
                style={{ width: 28, height: 28 }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={config.icon} alt="" width={28} height={28} style={{ width: 28, height: 28 }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm leading-tight">
                  {config.label}
                  {config.plusOnly && (
                    <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full"
                      style={{ background: "var(--accent)", color: "#fff" }}>Plus</span>
                  )}
                </div>
                <div className="text-xs" style={{ color: "var(--muted)" }}>{config.description}</div>
              </div>
              {isActive && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)"
                  strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                  className="flex-shrink-0">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              )}
            </button>
          );
        })}
      </div>
    </>
  );

  // Compact mode — icon-only button for feed cards
  if (compact) {
    return (
      <div ref={pickerRef}>
        <button
          ref={buttonRef}
          onClick={handleToggle}
          className="flex items-center gap-1 text-sm transition-colors"
          style={{
            color: myStamp ? "var(--accent)" : "var(--muted)",
            cursor: loading ? "wait" : "pointer",
          }}
          aria-label={myStamp ? `Your stamp: ${STAMP_CONFIG[myStamp]?.label}. Click to change.` : "Stamp this entry"}
          title={myStamp ? `Stamped: ${STAMP_CONFIG[myStamp]?.label}` : "Add a stamp"}
        >
          {myStamp ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={STAMP_CONFIG[myStamp]?.icon}
              alt=""
              width={18}
              height={18}
              style={{ width: 18, height: 18 }}
            />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10"/>
              <circle cx="12" cy="12" r="6"/>
              <circle cx="12" cy="12" r="2"/>
            </svg>
          )}
        </button>

        <FloatingPopup
          anchorRef={buttonRef}
          open={open}
          onClose={() => setOpen(false)}
          placement="top"
          className="rounded-xl border p-3 shadow-lg"
          style={{
            background: "var(--surface)",
            borderColor: "var(--border)",
            minWidth: 240,
          }}
        >
          {stampList}
        </FloatingPopup>
      </div>
    );
  }

  // Full mode — pill button with label (used on entry detail page)
  return (
    <div ref={pickerRef}>
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
        style={{
          borderColor: myStamp ? "var(--accent)" : "var(--border)",
          background: myStamp ? "var(--accent-light)" : "transparent",
          color: myStamp ? "var(--accent)" : "var(--muted)",
          cursor: loading ? "wait" : "pointer",
        }}
        aria-label={myStamp ? `Your stamp: ${STAMP_CONFIG[myStamp]?.label}. Click to change.` : "Stamp this entry"}
      >
        {myStamp ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={STAMP_CONFIG[myStamp]?.icon}
              alt=""
              width={16}
              height={16}
              style={{ width: 16, height: 16 }}
            />
            <span>{STAMP_CONFIG[myStamp]?.label}</span>
          </>
        ) : (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 8v8M8 12h8"/>
            </svg>
            <span>Stamp</span>
          </>
        )}
      </button>

      <FloatingPopup
        anchorRef={buttonRef}
        open={open}
        onClose={() => setOpen(false)}
        placement="bottom"
        className="rounded-xl border p-3 shadow-lg"
        style={{
          background: "var(--surface)",
          borderColor: "var(--border)",
          minWidth: 240,
        }}
      >
        {stampList}
      </FloatingPopup>
    </div>
  );
}
