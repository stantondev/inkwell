"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

interface ImportResult {
  imported: number;
  skipped: number;
  invalid: number;
}

const EMAIL_REGEX = /^[^\s]+@[^\s]+\.[^\s]+$/;

function parseEmails(text: string): string[] {
  // Split by newlines, commas, semicolons, or tabs
  return text
    .split(/[\n,;\t]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
}

function parseCSV(text: string): string[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  // Check if first line is a header
  const firstLine = lines[0].toLowerCase();
  const hasHeader =
    firstLine.includes("email") ||
    firstLine.includes("e-mail") ||
    firstLine.includes("subscriber");

  const headerLine = hasHeader ? lines[0] : null;
  const dataLines = hasHeader ? lines.slice(1) : lines;

  // Find email column index
  let emailColIndex = 0;
  if (headerLine) {
    const cols = headerLine.split(",").map((c) => c.trim().toLowerCase().replace(/"/g, ""));
    const idx = cols.findIndex(
      (c) => c === "email" || c === "e-mail" || c === "email address" || c === "subscriber_email"
    );
    if (idx >= 0) emailColIndex = idx;
  }

  const emails: string[] = [];
  for (const line of dataLines) {
    // Simple CSV parsing (handles quoted values)
    const cols: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        cols.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    cols.push(current.trim());

    const val = (cols[emailColIndex] || "").replace(/"/g, "").trim().toLowerCase();
    if (val && EMAIL_REGEX.test(val)) {
      emails.push(val);
    }
  }

  return [...new Set(emails)];
}

export default function ImportSubscribersPage() {
  const [pasteText, setPasteText] = useState("");
  const [parsedEmails, setParsedEmails] = useState<string[]>([]);
  const [invalidCount, setInvalidCount] = useState(0);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const [isPlus, setIsPlus] = useState(false);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.data?.subscription_tier === "plus") setIsPlus(true);
      })
      .catch(() => {});
  }, []);

  const cap = isPlus ? 5000 : 500;

  const processEmails = (rawEmails: string[]) => {
    const unique = [...new Set(rawEmails)];
    const valid = unique.filter((e) => EMAIL_REGEX.test(e));
    const invalid = unique.length - valid.length;
    setParsedEmails(valid);
    setInvalidCount(invalid);
    setResult(null);
    setError("");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (!text) return;

      // Detect if it's a CSV (has commas and multiple columns) or plain list
      const isCSV = file.name.endsWith(".csv") || text.split("\n")[0].includes(",");
      const emails = isCSV ? parseCSV(text) : parseEmails(text);
      processEmails(emails);
      setPasteText("");
    };
    reader.readAsText(file);
  };

  const handlePasteChange = (text: string) => {
    setPasteText(text);
    setFileName("");
    if (text.trim()) {
      const emails = parseEmails(text);
      processEmails(emails);
    } else {
      setParsedEmails([]);
      setInvalidCount(0);
    }
  };

  const handleImport = async () => {
    if (parsedEmails.length === 0) return;
    setImporting(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/newsletter/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: parsedEmails.slice(0, cap) }),
      });
      const data = await res.json();
      if (res.ok && data.data) {
        setResult(data.data);
      } else {
        setError(data.error || "Import failed");
      }
    } catch {
      setError("Failed to import subscribers");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/settings/newsletter"
        className="text-sm inline-flex items-center gap-1"
        style={{ color: "var(--accent)" }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Back to Newsletter
      </Link>

      <div>
        <h1
          className="text-xl font-semibold"
          style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
        >
          Import Subscribers
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          Migrating from Substack, Medium, or another platform? Import your subscriber list below.
          Each imported email will receive a confirmation email to comply with double opt-in requirements.
        </p>
      </div>

      {error && (
        <div
          className="rounded-xl border p-4 text-sm"
          style={{ borderColor: "var(--danger)", background: "var(--surface)" }}
        >
          <span style={{ color: "var(--danger)" }}>{error}</span>
        </div>
      )}

      {result && (
        <div
          className="rounded-xl border p-5"
          style={{ borderColor: "var(--accent)", background: "var(--surface)" }}
        >
          <h3
            className="text-sm font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)", color: "var(--accent)" }}
          >
            Import Complete
          </h3>
          <div className="space-y-1 text-sm">
            <p>
              <span className="font-semibold" style={{ color: "var(--accent)" }}>
                {result.imported}
              </span>{" "}
              subscribers imported — confirmation emails are being sent
            </p>
            {result.skipped > 0 && (
              <p style={{ color: "var(--muted)" }}>
                {result.skipped} already subscribed (skipped)
              </p>
            )}
            {result.invalid > 0 && (
              <p style={{ color: "var(--muted)" }}>
                {result.invalid} invalid emails (skipped)
              </p>
            )}
          </div>
        </div>
      )}

      {/* Upload section */}
      <div
        className="rounded-xl border p-6"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <h3
          className="text-sm font-semibold mb-4"
          style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
        >
          Upload a file
        </h3>
        <p className="text-sm mb-3" style={{ color: "var(--muted)" }}>
          Upload a .csv or .txt file containing email addresses. CSV files with multiple columns
          will auto-detect the email column.
        </p>
        <div className="flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
            style={{
              borderColor: "var(--border)",
              background: "var(--background)",
              color: "var(--foreground)",
            }}
          >
            Choose file
          </button>
          {fileName && (
            <span className="text-sm" style={{ color: "var(--muted)" }}>
              {fileName}
            </span>
          )}
        </div>
      </div>

      {/* Paste section */}
      <div
        className="rounded-xl border p-6"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <h3
          className="text-sm font-semibold mb-4"
          style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
        >
          Or paste emails
        </h3>
        <p className="text-sm mb-3" style={{ color: "var(--muted)" }}>
          One email per line, or separated by commas.
        </p>
        <textarea
          value={pasteText}
          onChange={(e) => handlePasteChange(e.target.value)}
          placeholder={"reader@example.com\nanother@example.com\nfan@example.com"}
          rows={6}
          className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] font-mono"
          style={{
            borderColor: "var(--border)",
            background: "var(--background)",
            color: "var(--foreground)",
            resize: "vertical",
          }}
        />
      </div>

      {/* Preview */}
      {parsedEmails.length > 0 && (
        <div
          className="rounded-xl border p-5"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <h3
            className="text-sm font-semibold mb-2"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            Preview
          </h3>
          <div className="text-sm space-y-1">
            <p>
              <span className="font-semibold" style={{ color: "var(--accent)" }}>
                {Math.min(parsedEmails.length, cap)}
              </span>{" "}
              valid email{parsedEmails.length !== 1 ? "s" : ""} found
              {parsedEmails.length > cap && (
                <span style={{ color: "var(--danger)" }}>
                  {" "}(capped at {cap} for your plan)
                </span>
              )}
            </p>
            {invalidCount > 0 && (
              <p style={{ color: "var(--muted)" }}>
                {invalidCount} invalid email{invalidCount !== 1 ? "s" : ""} will be skipped
              </p>
            )}
          </div>

          <button
            onClick={handleImport}
            disabled={importing}
            className="mt-4 rounded-full px-6 py-2.5 text-sm font-medium transition-opacity disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {importing
              ? "Importing..."
              : `Import ${Math.min(parsedEmails.length, cap)} subscriber${parsedEmails.length !== 1 ? "s" : ""}`}
          </button>
        </div>
      )}

      {/* Info */}
      <div
        className="rounded-xl border p-5"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <h3
          className="text-sm font-semibold mb-2"
          style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
        >
          How it works
        </h3>
        <ul className="text-sm space-y-2" style={{ color: "var(--muted)" }}>
          <li>
            Each imported email will receive a <strong style={{ color: "var(--foreground)" }}>confirmation email</strong> asking
            them to opt in to your newsletter (double opt-in, CAN-SPAM compliant).
          </li>
          <li>
            Emails that are already subscribed (any status) will be skipped automatically.
          </li>
          <li>
            Subscribers who confirm will appear in your subscriber list with source{" "}
            <em>&quot;via import&quot;</em>.
          </li>
          <li>
            <strong style={{ color: "var(--foreground)" }}>Limits:</strong> Free accounts can
            import up to 500 emails per batch. Plus accounts can import up to 5,000.
          </li>
        </ul>
      </div>
    </div>
  );
}
