"use client";

import { useState, useCallback } from "react";
import { TranslateButton } from "@/components/translate-button";

interface TranslatableEntryProps {
  type: string;
  id: string;
  originalBodyHtml: string;
  preferredLanguage?: string | null;
  isLoggedIn: boolean;
  className?: string;
  /** Server-rendered original content */
  children: React.ReactNode;
}

/**
 * Client wrapper that adds inline translation to any content block.
 * When not translated, renders children (server content) as-is.
 * When translated, hides children and shows translated HTML.
 */
export function TranslatableEntry({
  type,
  id,
  originalBodyHtml,
  preferredLanguage,
  isLoggedIn,
  className,
  children,
}: TranslatableEntryProps) {
  const [translatedBody, setTranslatedBody] = useState<string | null>(null);
  const [sourceLang, setSourceLang] = useState<string | null>(null);
  const [isTranslated, setIsTranslated] = useState(false);

  const handleTranslation = useCallback(
    (
      translation: {
        translated_title: string | null;
        translated_body: string;
        source_language: string;
      } | null
    ) => {
      if (translation) {
        setTranslatedBody(translation.translated_body);
        setSourceLang(translation.source_language);
        setIsTranslated(true);
      } else {
        setIsTranslated(false);
      }
    },
    []
  );

  if (!isLoggedIn) {
    return <>{children}</>;
  }

  return (
    <div className={className}>
      <TranslateButton
        type={type}
        id={id}
        preferredLanguage={preferredLanguage}
        onTranslation={handleTranslation}
        size={16}
      />

      {/* Show translated content when active, original otherwise */}
      {isTranslated && translatedBody ? (
        <div
          className="prose-entry"
          style={{ color: "var(--foreground)" }}
          dangerouslySetInnerHTML={{ __html: translatedBody }}
        />
      ) : (
        children
      )}
    </div>
  );
}
