"use client";

import { useState, useRef, useEffect } from "react";
import { STAMP_CONFIG, STAMP_TYPES, resolveStampType } from "./stamp-config";
import { StampFrame } from "./stamp-frame";
import { FloatingPopup } from "./floating-popup";

interface StampPickerProps {
  entryId: string;
  currentStamp: string | null;
  isOwnEntry: boolean;
  isLoggedIn: boolean;
  isPlus: boolean;
  /** Compact mode for feed cards — shows just an icon button */
  compact?: boolean;
  /** Override the API path for stamping (e.g., for remote entries) */
  stampApiPath?: string;
  onStampChange?: (stamps: string[], myStamp: string | null) => void;
}

export function StampPicker({
  entryId,
  currentStamp,
  isOwnEntry,
  isLoggedIn,
  isPlus,
  compact = false,
  stampApiPath,
  onStampChange,
}: StampPickerProps) {
  const [open, setOpen] = useState(false);
  const [myStamp, setMyStamp] = useState<string | null>(
    currentStamp ? resolveStampType(currentStamp) : null
  );
  const [loading, setLoading] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const apiPath = stampApiPath ?? `/api/entries/${entryId}/stamp`;

  useEffect(() => {
    setMyStamp(currentStamp ? resolveStampType(currentStamp) : null);
  }, [currentStamp]);

  if (isOwnEntry) return null;

  function handleToggle() {
    if (!isLoggedIn) {
      window.location.href = "/get-started";
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
        const res = await fetch(apiPath, { method: "DELETE" });
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
      const res = await fetch(apiPath, {
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

  // Grid of stamp thumbnails
  const stampGrid = (
    <>
      <p
        className="text-xs font-medium mb-3"
        style={{
          color: "var(--muted)",
          fontFamily: "var(--font-lora, Georgia, serif)",
          fontStyle: "italic",
        }}
      >
        Choose a stamp
      </p>
      <div className="stamp-picker-grid">
        {STAMP_TYPES.map((type) => {
          const config = STAMP_CONFIG[type];
          const isDisabled = config.plusOnly && !isPlus;
          const isActive = myStamp === type;

          return (
            <button
              key={type}
              onClick={() => !isDisabled && handleStamp(type)}
              disabled={isDisabled || loading}
              className="stamp-picker-item"
              data-active={isActive ? "true" : undefined}
              data-disabled={isDisabled ? "true" : undefined}
              title={isDisabled ? "Plus subscription required" : config.description}
            >
              <StampFrame
                stampType={type}
                size="lg"
                showLabel={false}
              />
              <span className="stamp-picker-item-label">
                {config.label}
                {config.plusOnly && (
                  <span
                    className="ml-1 text-[8px] px-1 py-0.5 rounded-full"
                    style={{ background: "var(--accent)", color: "#fff" }}
                  >
                    Plus
                  </span>
                )}
              </span>
              <span className="stamp-picker-item-desc">{config.description}</span>
              {isActive && (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          );
        })}
      </div>
    </>
  );

  // Compact mode — mini stamp icon button for feed cards
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
          aria-label={
            myStamp
              ? `Your stamp: ${STAMP_CONFIG[myStamp]?.label}. Click to change.`
              : "Stamp this entry"
          }
          title={myStamp ? `Stamped: ${STAMP_CONFIG[myStamp]?.label}` : "Add a stamp"}
        >
          {myStamp ? (
            <StampFrame stampType={myStamp} size="xs" />
          ) : (
            // Mini stamp silhouette icon (dashed rectangle)
            <svg
              width="16"
              height="16"
              viewBox="0 0 20 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect
                x="2"
                y="1"
                width="16"
                height="22"
                rx="1.5"
                strokeDasharray="2.5 2"
              />
              <circle cx="10" cy="10" r="3" opacity="0.5" />
              <line x1="6" y1="17" x2="14" y2="17" opacity="0.4" />
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
            minWidth: "min(280px, calc(100vw - 32px))",
            maxWidth: "min(340px, calc(100vw - 32px))",
          }}
        >
          {stampGrid}
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
        aria-label={
          myStamp
            ? `Your stamp: ${STAMP_CONFIG[myStamp]?.label}. Click to change.`
            : "Stamp this entry"
        }
      >
        {myStamp ? (
          <>
            <StampFrame stampType={myStamp} size="xs" />
            <span>{STAMP_CONFIG[myStamp]?.label}</span>
          </>
        ) : (
          <>
            {/* Mini stamp icon */}
            <svg
              width="14"
              height="14"
              viewBox="0 0 20 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect
                x="2"
                y="1"
                width="16"
                height="22"
                rx="1.5"
                strokeDasharray="2.5 2"
              />
              <path d="M10 8v8M6 12h8" opacity="0.6" />
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
          minWidth: "min(280px, calc(100vw - 32px))",
          maxWidth: "min(340px, calc(100vw - 32px))",
        }}
      >
        {stampGrid}
      </FloatingPopup>
    </div>
  );
}
