"use client";

import { useRef, useState } from "react";
import Link from "next/link";

interface ErrorReportButtonProps {
  errorMessage: string;
  errorDigest?: string;
  stackTrace?: string;
  url: string;
  inlineStyles?: boolean;
}

type ReportState = "idle" | "editing" | "submitting" | "success" | "auth_required" | "error";

function buildTitle(errorMessage: string): string {
  const prefix = "Bug: ";
  const max = 200 - prefix.length;
  const msg = errorMessage.length > max ? errorMessage.slice(0, max - 3) + "..." : errorMessage;
  return prefix + msg;
}

function buildBody(
  errorMessage: string,
  errorDigest: string | undefined,
  stackTrace: string | undefined,
  url: string,
  userContext: string,
): string {
  const lines: string[] = [
    "## Automatic Bug Report\n",
    `**Error:** ${errorMessage}`,
  ];

  if (errorDigest) lines.push(`**Digest:** ${errorDigest}`);

  lines.push(
    `**URL:** ${url}`,
    `**Time:** ${new Date().toISOString()}`,
    `**Browser:** ${typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : "unknown"}`,
    "",
  );

  if (stackTrace) {
    const truncated = stackTrace.split("\n").slice(0, 20).join("\n");
    lines.push("### Stack Trace", "```", truncated, "```", "");
  }

  lines.push("### User Context", userContext.trim() || "No additional context provided.");

  return lines.join("\n").slice(0, 5000);
}

export function ErrorReportButton({
  errorMessage,
  errorDigest,
  stackTrace,
  url,
  inlineStyles = false,
}: ErrorReportButtonProps) {
  const [state, setState] = useState<ReportState>("idle");
  const [context, setContext] = useState("");
  const [postId, setPostId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const submittingRef = useRef(false);

  const accent = inlineStyles ? "#2d4a8a" : "var(--accent)";
  const muted = inlineStyles ? "#78716c" : "var(--muted)";
  const surface = inlineStyles ? "#ffffff" : "var(--surface)";
  const border = inlineStyles ? "#e7e5e4" : "var(--border)";
  const foreground = inlineStyles ? "#1c1917" : "var(--foreground)";
  const success = inlineStyles ? "#16a34a" : "var(--success)";
  const danger = inlineStyles ? "#dc2626" : "var(--danger)";

  async function handleSubmit() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setState("submitting");

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: buildTitle(errorMessage),
          body: buildBody(errorMessage, errorDigest, stackTrace, url, context),
          category: "bug",
          image_ids: [],
        }),
      });

      if (res.status === 401) {
        setState("auth_required");
        return;
      }

      const data = await res.json();

      if (res.ok) {
        setPostId(data.data?.id ?? null);
        setState("success");
      } else {
        setErrorMsg(data.error || data.errors?.title?.[0] || data.errors?.body?.[0] || "Failed to submit");
        setState("error");
      }
    } catch {
      setErrorMsg("Could not reach the server. Please try again.");
      setState("error");
    } finally {
      submittingRef.current = false;
    }
  }

  if (state === "success") {
    return (
      <div
        className={inlineStyles ? "" : "rounded-xl border p-4"}
        style={{
          borderColor: border,
          background: surface,
          ...(inlineStyles ? { border: `1px solid ${border}`, borderRadius: 12, padding: 16 } : {}),
        }}
      >
        <p style={{ color: success, fontWeight: 500, fontSize: 14 }}>
          Bug report submitted — thank you for helping improve Inkwell!
        </p>
        {postId && (
          <Link
            href={`/roadmap/${postId}`}
            style={{ color: accent, fontSize: 14, textDecoration: "underline", marginTop: 8, display: "inline-block" }}
          >
            View your report on the roadmap
          </Link>
        )}
      </div>
    );
  }

  if (state === "auth_required") {
    return (
      <div
        className={inlineStyles ? "" : "rounded-xl border p-4"}
        style={{
          borderColor: border,
          background: surface,
          ...(inlineStyles ? { border: `1px solid ${border}`, borderRadius: 12, padding: 16 } : {}),
        }}
      >
        <p style={{ color: muted, fontSize: 14 }}>
          <Link href="/login" style={{ color: accent, textDecoration: "underline" }}>
            Sign in
          </Link>{" "}
          to report this bug and help us fix it.
        </p>
      </div>
    );
  }

  if (state === "idle") {
    return (
      <button
        onClick={() => setState("editing")}
        className={inlineStyles ? "" : "rounded-full border px-4 py-2 text-sm font-medium transition-colors"}
        style={{
          borderColor: border,
          color: muted,
          background: "transparent",
          cursor: "pointer",
          ...(inlineStyles ? { border: `1px solid ${border}`, borderRadius: 9999, padding: "8px 16px", fontSize: 14, fontWeight: 500 } : {}),
        }}
      >
        Report this bug
      </button>
    );
  }

  // editing, submitting, or error states
  return (
    <div
      className={inlineStyles ? "" : "rounded-xl border p-4 space-y-3"}
      style={{
        borderColor: border,
        background: surface,
        ...(inlineStyles ? { border: `1px solid ${border}`, borderRadius: 12, padding: 16, display: "flex", flexDirection: "column" as const, gap: 12 } : {}),
      }}
    >
      <p style={{ color: muted, fontSize: 13 }}>
        What were you doing when this happened? <span style={{ fontWeight: 400 }}>(optional)</span>
      </p>
      <textarea
        value={context}
        onChange={(e) => setContext(e.target.value)}
        maxLength={2000}
        rows={3}
        placeholder="e.g. I clicked the back button after editing a post..."
        className={inlineStyles ? "" : "w-full rounded-xl border px-4 py-3 text-sm resize-none focus:outline-none"}
        style={{
          borderColor: border,
          background: inlineStyles ? "#fafaf9" : "var(--background)",
          color: foreground,
          ...(inlineStyles ? { width: "100%", border: `1px solid ${border}`, borderRadius: 12, padding: "12px 16px", fontSize: 14, resize: "none" as const } : {}),
        }}
      />

      {state === "error" && errorMsg && (
        <p style={{ color: danger, fontSize: 13 }}>{errorMsg}</p>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={handleSubmit}
          disabled={state === "submitting"}
          className={inlineStyles ? "" : "rounded-full px-5 py-2 text-sm font-medium transition-colors"}
          style={{
            background: accent,
            color: "#fff",
            opacity: state === "submitting" ? 0.5 : 1,
            cursor: state === "submitting" ? "default" : "pointer",
            border: "none",
            ...(inlineStyles ? { borderRadius: 9999, padding: "8px 20px", fontSize: 14, fontWeight: 500 } : {}),
          }}
        >
          {state === "submitting" ? "Submitting..." : "Submit report"}
        </button>
        <button
          onClick={() => { setState("idle"); setContext(""); setErrorMsg(""); }}
          style={{ color: muted, fontSize: 14, background: "none", border: "none", cursor: "pointer" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
