"use client";

import { useEffect, useRef, forwardRef } from "react";

interface SearchInputProps {
  query: string;
  onChange: (value: string) => void;
  placeholder: string;
  showGlobe?: boolean;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  function SearchInput({ query, onChange, placeholder, showGlobe }, ref) {
    const inputRef = useRef<HTMLInputElement>(null);
    const resolvedRef = (ref as React.RefObject<HTMLInputElement>) || inputRef;

    // Listen for global Cmd+K focus event
    useEffect(() => {
      function handleFocus() {
        resolvedRef.current?.focus();
        resolvedRef.current?.select();
      }
      window.addEventListener("inkwell-search-focus", handleFocus);
      return () => window.removeEventListener("inkwell-search-focus", handleFocus);
    }, [resolvedRef]);

    const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);

    return (
      <div className="catalog-search-wrap">
        {showGlobe ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className="catalog-search-icon">
            <circle cx="12" cy="12" r="10"/>
            <line x1="2" y1="12" x2="22" y2="12"/>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className="catalog-search-icon">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        )}
        <input
          ref={resolvedRef}
          type="text"
          value={query}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="catalog-search-input"
          autoFocus
        />
        <span className="catalog-shortcut-badge">{isMac ? "⌘K" : "Ctrl+K"}</span>
      </div>
    );
  }
);
