"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { TranslateButton } from "@/components/translate-button";

/**
 * The title and the body of an entry page are rendered in different places,
 * so the body's translation is broadcast for <TranslatableTitle> to pick up.
 */
const TITLE_EVENT = "inkwell-entry-title-translation";

interface TitleDetail {
  id: string;
  title: string | null;
}

interface TranslatableEntryProps {
  type: string;
  id: string;
  originalBodyHtml: string;
  preferredLanguage?: string | null;
  isLoggedIn: boolean;
  /** Where signed-out readers are sent to sign in and come back */
  loginHref?: string;
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
  preferredLanguage,
  isLoggedIn,
  loginHref,
  className,
  children,
}: TranslatableEntryProps) {
  const [translatedBody, setTranslatedBody] = useState<string | null>(null);
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
        setIsTranslated(true);
      } else {
        setIsTranslated(false);
      }
      window.dispatchEvent(
        new CustomEvent<TitleDetail>(TITLE_EVENT, {
          detail: { id, title: translation?.translated_title ?? null },
        })
      );
    },
    [id]
  );

  if (!isLoggedIn) {
    return (
      <div className={className}>
        {loginHref && (
          <Link
            href={loginHref}
            className="inline-flex items-center gap-1 mb-3 text-xs hover:underline"
            style={{ color: "var(--muted)" }}
          >
            <GlobeIcon />
            Sign in to translate
          </Link>
        )}
        {children}
      </div>
    );
  }

  return (
    <div className={className}>
      <TranslateButton
        type={type}
        id={id}
        preferredLanguage={preferredLanguage}
        onTranslation={handleTranslation}
        size={16}
        showLabel
        className="mb-3"
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

/** Shows the translated title while the entry's body is translated. */
export function TranslatableTitle({ id, children }: { id: string; children: React.ReactNode }) {
  const [title, setTitle] = useState<string | null>(null);

  useEffect(() => {
    function onTranslation(e: Event) {
      const detail = (e as CustomEvent<TitleDetail>).detail;
      if (detail?.id === id) setTitle(detail.title);
    }
    window.addEventListener(TITLE_EVENT, onTranslation);
    return () => window.removeEventListener(TITLE_EVENT, onTranslation);
  }, [id]);

  return <>{title ?? children}</>;
}

function GlobeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}
