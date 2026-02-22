"use client";

import { useCallback, useEffect } from "react";

interface PageNavigationProps {
  currentPage: number;
  totalPages: number;
  onNavigate: (page: number) => void;
}

export function PageNavigation({
  currentPage,
  totalPages,
  onNavigate,
}: PageNavigationProps) {
  const canGoBack = currentPage > 0;
  const canGoForward = currentPage < totalPages - 1;

  const goBack = useCallback(() => {
    if (canGoBack) onNavigate(currentPage - 1);
  }, [canGoBack, currentPage, onNavigate]);

  const goForward = useCallback(() => {
    if (canGoForward) onNavigate(currentPage + 1);
  }, [canGoForward, currentPage, onNavigate]);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goBack();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goForward();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goBack, goForward]);

  if (totalPages <= 1) return null;

  return (
    <>
      {/* Left arrow */}
      {canGoBack && (
        <button
          className="journal-nav-arrow left"
          onClick={goBack}
          aria-label="Previous page"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      )}

      {/* Right arrow */}
      {canGoForward && (
        <button
          className="journal-nav-arrow right"
          onClick={goForward}
          aria-label="Next page"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      )}

      {/* Bottom: dots + page counter */}
      <div className="flex flex-col items-center">
        {/* Dots */}
        <div className="journal-dots" role="tablist" aria-label="Pages">
          {Array.from({ length: totalPages }, (_, i) => (
            <button
              key={i}
              className="journal-dot"
              data-active={i === currentPage ? "true" : "false"}
              onClick={() => onNavigate(i)}
              role="tab"
              aria-selected={i === currentPage}
              aria-label={`Page ${i + 1}`}
            />
          ))}
        </div>

        {/* Page counter */}
        <div className="journal-page-counter">
          {currentPage + 1} &mdash; {totalPages}
        </div>
      </div>
    </>
  );
}
