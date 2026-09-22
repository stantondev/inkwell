"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface ExploreSearchBarProps {
  initialQuery?: string;
  onQueryChange: (query: string) => void;
}

export function ExploreSearchBar({ initialQuery = "", onQueryChange }: ExploreSearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  // Every `q` this component has written to the URL itself. A Set, not the
  // last value: on a slow connection router.replace commits the URL only after
  // the server answers, so an older write can land after a newer one.
  const pushedRef = useRef(new Set<string>());
  const router = useRouter();
  const searchParams = useSearchParams();

  // Resolved after mount, not during render: the server has no user agent, so
  // rendering the Mac glyph on the first client pass makes React throw away the
  // server HTML for the whole page ("server rendered text didn't match"). Same
  // pattern as the sidebar's shortcut hint.
  const [shortcutHint, setShortcutHint] = useState("Ctrl+K");
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.userAgent)) setShortcutHint("\u2318K");
  }, []);

  // Sync URL → state on back/forward only. This used to react to every URL
  // change, including the ones the box made itself 350ms after a pause: the
  // URL still held the older text, so it overwrote the letters typed since
  // (and any trailing space, since the URL value is trimmed). Typing at phone
  // speed turned "sticky tester" into "siketr".
  useEffect(() => {
    const q = searchParams.get("q") || "";
    if (pushedRef.current.has(q)) return;
    if (q !== query.trim()) {
      setQuery(q);
      onQueryChange(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Debounced query change → update URL + notify parent
  const handleChange = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      // Update URL with q param
      const params = new URLSearchParams(searchParams.toString());
      if (value.trim()) {
        params.set("q", value.trim());
        // Reset page when searching
        params.delete("page");
      } else {
        params.delete("q");
      }
      const qs = params.toString();
      pushedRef.current.add(value.trim());
      router.replace(`/explore${qs ? `?${qs}` : ""}`, { scroll: false });
      onQueryChange(value.trim());
    }, 350);
  }, [searchParams, router, onQueryChange]);

  // Escape clears search
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setQuery("");
      const params = new URLSearchParams(searchParams.toString());
      params.delete("q");
      params.delete("page");
      const qs = params.toString();
      pushedRef.current.add("");
      router.replace(`/explore${qs ? `?${qs}` : ""}`, { scroll: false });
      onQueryChange("");
      inputRef.current?.blur();
    }
  }

  // The mobile top bar's search button links to /explore?focus=search
  const wantsFocus = searchParams.get("focus") === "search";
  useEffect(() => {
    if (!wantsFocus) return;
    inputRef.current?.focus();
    inputRef.current?.scrollIntoView({ block: "center" });
    const params = new URLSearchParams(searchParams.toString());
    params.delete("focus");
    const qs = params.toString();
    router.replace(`/explore${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [wantsFocus]); // eslint-disable-line react-hooks/exhaustive-deps

  // Global Cmd+K / Ctrl+K to focus
  useEffect(() => {
    function handleGlobalKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    // Also listen for the custom event from other pages
    function handleFocusEvent() {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    window.addEventListener("keydown", handleGlobalKey);
    window.addEventListener("inkwell-search-focus", handleFocusEvent);
    return () => {
      window.removeEventListener("keydown", handleGlobalKey);
      window.removeEventListener("inkwell-search-focus", handleFocusEvent);
    };
  }, []);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="explore-search-bar">
      <div className="explore-search-wrap">
        <svg
          width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className="explore-search-icon"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Look up writers, entries, or @handles..."
          className="explore-search-input"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          role="search"
          aria-label="Search writers, entries, and fediverse handles"
        />
        {!query && (
          <span className="explore-shortcut-badge">{shortcutHint}</span>
        )}
        {query && (
          <button
            className="explore-search-clear"
            onClick={() => {
              setQuery("");
              const params = new URLSearchParams(searchParams.toString());
              params.delete("q");
              params.delete("page");
              const qs = params.toString();
              pushedRef.current.add("");
              if (debounceRef.current) clearTimeout(debounceRef.current);
              router.replace(`/explore${qs ? `?${qs}` : ""}`, { scroll: false });
              onQueryChange("");
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
