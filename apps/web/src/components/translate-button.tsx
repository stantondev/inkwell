"use client";

import { useState, useRef } from "react";
import { FloatingPopup } from "@/components/floating-popup";

const LANGUAGES = [
  { code: "EN-US", label: "English" },
  { code: "ES", label: "Spanish" },
  { code: "FR", label: "French" },
  { code: "DE", label: "German" },
  { code: "PT-BR", label: "Portuguese (BR)" },
  { code: "JA", label: "Japanese" },
  { code: "ZH", label: "Chinese" },
  { code: "KO", label: "Korean" },
  { code: "IT", label: "Italian" },
  { code: "RU", label: "Russian" },
  { code: "NL", label: "Dutch" },
  { code: "PL", label: "Polish" },
  { code: "TR", label: "Turkish" },
  { code: "UK", label: "Ukrainian" },
  { code: "SV", label: "Swedish" },
];

interface TranslateButtonProps {
  type: string;
  id: string;
  preferredLanguage?: string | null;
  /** Called when translation is available — parent renders translated content */
  onTranslation?: (translation: {
    translated_title: string | null;
    translated_body: string;
    source_language: string;
  } | null) => void;
  size?: number;
  className?: string;
}

export function TranslateButton({
  type,
  id,
  preferredLanguage,
  onTranslation,
  size = 15,
  className = "",
}: TranslateButtonProps) {
  const [isTranslating, setIsTranslating] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [translation, setTranslation] = useState<{
    translated_title: string | null;
    translated_body: string;
    source_language: string;
    target_language: string;
  } | null>(null);
  const [langPickerOpen, setLangPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  async function doTranslate(targetLang: string) {
    setIsTranslating(true);
    setError(null);
    setLangPickerOpen(false);

    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id, target_lang: targetLang }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Translation failed");
        setIsTranslating(false);
        return;
      }

      const { data } = await res.json();
      setTranslation(data);
      setShowTranslation(true);
      onTranslation?.(data);
    } catch {
      setError("Network error");
    } finally {
      setIsTranslating(false);
    }
  }

  function handleClick() {
    if (showTranslation) {
      // Toggle back to original
      setShowTranslation(false);
      onTranslation?.(null);
      return;
    }

    if (translation) {
      // Re-show cached translation
      setShowTranslation(true);
      onTranslation?.(translation);
      return;
    }

    // Translate — if user has preferred language, use it directly
    if (preferredLanguage) {
      doTranslate(preferredLanguage);
    } else {
      setLangPickerOpen(!langPickerOpen);
    }
  }

  function handleLanguageSelect(code: string) {
    doTranslate(code);
  }

  // Language name lookup
  const sourceLangName = translation
    ? LANGUAGES.find((l) => l.code.startsWith(translation.source_language))?.label ||
      translation.source_language
    : null;

  return (
    <div className={className}>
      <button
        ref={btnRef}
        onClick={handleClick}
        disabled={isTranslating}
        className="flex items-center gap-1 transition-opacity hover:opacity-80 cursor-pointer disabled:opacity-50"
        style={{ color: showTranslation ? "var(--accent)" : "var(--muted)" }}
        title={showTranslation ? "Show original" : "Translate"}
        aria-label={showTranslation ? "Show original" : "Translate"}
      >
        {isTranslating ? (
          <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            className="animate-spin"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="8" />
          </svg>
        ) : (
          <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        )}
        {showTranslation && (
          <span className="text-xs" style={{ color: "var(--accent)" }}>
            {sourceLangName ? `From ${sourceLangName}` : "Translated"}
          </span>
        )}
      </button>

      {/* Translation status bar — shown below when translation is active */}
      {showTranslation && !isTranslating && (
        <div
          className="mt-1.5 flex items-center gap-2 text-xs"
          style={{ color: "var(--muted)" }}
        >
          <button
            onClick={handleClick}
            className="hover:underline cursor-pointer"
            style={{ color: "var(--accent)" }}
          >
            Show original
          </button>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="mt-1 text-xs" style={{ color: "var(--danger, #ef4444)" }}>
          {error}
        </div>
      )}

      {/* Language picker popup */}
      <FloatingPopup
        anchorRef={btnRef}
        open={langPickerOpen}
        onClose={() => setLangPickerOpen(false)}
        placement="bottom"
        className="rounded-xl border shadow-lg overflow-hidden"
        style={{
          background: "var(--surface)",
          borderColor: "var(--border)",
          width: "min(200px, calc(100vw - 32px))",
        }}
      >
        <div className="py-1">
          <div
            className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-semibold"
            style={{ color: "var(--muted)" }}
          >
            Translate to
          </div>
          <div className="max-h-[240px] overflow-y-auto">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleLanguageSelect(lang.code)}
                className="w-full text-left px-3 py-1.5 text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
                style={{ color: "var(--foreground)" }}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </div>
      </FloatingPopup>
    </div>
  );
}
