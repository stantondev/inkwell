"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Avatar } from "@/components/avatar-with-frame";
import { trackFeature } from "@/lib/usage";

/**
 * Quick search ("Power Search", roadmap #104, 2026-11-05).
 *
 * Search left the navigation in March, when it moved into Explore, and after
 * that the only ways in were ⌘K (which nobody knew about) and the phone's
 * top-bar icon, which navigated away to Explore. Now a magnifying glass in the
 * sidebar, the phone top bar and the signed-out bar opens this box over
 * whatever page you're on: writers, posts, tags, series and Inkwell's own
 * pages, with the full results one Enter away on Explore.
 *
 * Mounted once in AppShell. Open it from anywhere with `openQuickSearch()`,
 * ⌘K / Ctrl+K, or "/" when you aren't typing.
 */

export const QUICK_SEARCH_EVENT = "inkwell-quick-search";

export function openQuickSearch() {
  window.dispatchEvent(new Event(QUICK_SEARCH_EVENT));
}

// ─── Button ──────────────────────────────────────────────────────────────────

export function SearchIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7.5" />
      <path d="M20.5 20.5l-4.2-4.2" />
    </svg>
  );
}

export function QuickSearchButton({ className, size = 20 }: { className?: string; size?: number }) {
  const [hint, setHint] = useState("Ctrl+K");
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.userAgent)) setHint("⌘K");
  }, []);
  return (
    <button
      type="button"
      className={className}
      onClick={openQuickSearch}
      aria-label="Search Inkwell"
      title={`Search (${hint})`}
    >
      <SearchIcon size={size} />
    </button>
  );
}

// ─── Data ────────────────────────────────────────────────────────────────────

interface Writer {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface Entry {
  id: string;
  slug: string;
  title: string | null;
  excerpt?: string | null;
  body_html?: string;
  author?: { username: string; display_name: string | null };
}

interface Tag {
  tag: string;
  slug: string;
  entries: number;
}

interface Series {
  id: string;
  title: string;
  slug: string;
  entry_count: number;
  author: { username: string; display_name: string | null };
}

interface Page {
  label: string;
  href: string;
  words: string;
}

const MEMBER_PAGES: Page[] = [
  { label: "Feed", href: "/feed", words: "home timeline following" },
  { label: "Explore", href: "/explore", words: "discover browse fediverse" },
  { label: "Notifications", href: "/notifications", words: "alerts bell" },
  { label: "Letters", href: "/letters", words: "messages dm mail inbox" },
  { label: "Pen Pals", href: "/pen-pals", words: "friends followers following" },
  { label: "Write an entry", href: "/editor", words: "new post editor compose" },
  { label: "Drafts", href: "/drafts", words: "unpublished" },
  { label: "Posts", href: "/manage", words: "manage bulk my entries spreadsheet" },
  { label: "Bookmarks", href: "/saved", words: "saved reading list" },
  { label: "Readers", href: "/readers", words: "stats reads analytics" },
  { label: "Stamp album", href: "/stamp-album", words: "stamps collection" },
  { label: "Arrange my page", href: "/arrange", words: "profile layout stickers widgets" },
  { label: "Gazette", href: "/gazette", words: "news paper headlines" },
  { label: "Circles", href: "/circles", words: "groups communities" },
  { label: "Polls", href: "/polls", words: "vote community voice" },
  { label: "Roadmap", href: "/roadmap", words: "feedback ideas bugs features" },
  { label: "What's new", href: "/whats-new", words: "changelog updates releases" },
  { label: "Settings", href: "/settings", words: "preferences account profile billing" },
  { label: "Help", href: "/help", words: "faq support guide contact" },
];

const VISITOR_PAGES: Page[] = [
  { label: "Explore", href: "/explore", words: "discover browse fediverse" },
  { label: "Gazette", href: "/gazette", words: "news paper headlines" },
  { label: "Circles", href: "/circles", words: "groups communities" },
  { label: "Roadmap", href: "/roadmap", words: "feedback ideas features" },
  { label: "About Inkwell", href: "/about", words: "what is inkwell" },
  { label: "Help", href: "/help", words: "faq support guide" },
  { label: "Sign in", href: "/login", words: "log in login" },
  { label: "Get started", href: "/get-started", words: "sign up join register" },
];

const FEDIVERSE_HANDLE = /^@?[^@\s]+@[^@\s]+\.[^@\s]+$/;

function plainText(html: string | undefined | null): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function entryLabel(e: Entry): string {
  const title = plainText(e.title);
  if (title) return title;
  const text = plainText(e.excerpt) || plainText(e.body_html);
  return text.length > 70 ? text.slice(0, 70).replace(/\s\S*$/, "") + "…" : text || "Untitled";
}

async function getList<T>(type: string, q: string, signal: AbortSignal): Promise<T[]> {
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&type=${type}`, { signal });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.data) ? data.data : [];
  } catch {
    return [];
  }
}

// One row in the keyboard order.
interface Item {
  key: string;
  href: string;
}

// ─── Palette ─────────────────────────────────────────────────────────────────

export function QuickSearch({ signedIn, username }: { signedIn: boolean; username?: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [writers, setWriters] = useState<Writer[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [series, setSeries] = useState<Series[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  // Where the pointer last really was: the list scrolling under a resting
  // pointer makes the browser send mousemove too, which would steal the
  // keyboard's selection.
  const pointer = useRef({ x: -1, y: -1 });

  const close = useCallback(() => {
    setOpen(false);
    returnFocus.current?.focus?.();
  }, []);

  const show = useCallback(() => {
    returnFocus.current = document.activeElement as HTMLElement | null;
    setOpen(true);
  }, []);

  // Openers: the buttons' event, ⌘K, and "/".
  useEffect(() => {
    const onEvent = () => show();
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inSettings = pathname === "/settings" || pathname.startsWith("/settings/");
      const inEditor = pathname === "/editor" || pathname.startsWith("/editor/");
      // Explore has its own search bar with full results right there.
      const onExplore = pathname === "/explore";
      const focusExplore = () => window.dispatchEvent(new Event("inkwell-search-focus"));

      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "k") {
        // Settings has its own ⌘K jump palette, and in the editor and other
        // rich text boxes ⌘K adds a link.
        if (inSettings || inEditor || target?.isContentEditable) return;
        e.preventDefault();
        if (open) close();
        else if (onExplore) focusExplore();
        else show();
        return;
      }

      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !open) {
        const typing =
          !!target &&
          (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
        // Settings uses "/" for its own search box.
        if (typing || inSettings || inEditor) return;
        e.preventDefault();
        if (onExplore) focusExplore();
        else show();
      }
    };
    window.addEventListener(QUICK_SEARCH_EVENT, onEvent);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(QUICK_SEARCH_EVENT, onEvent);
      window.removeEventListener("keydown", onKey);
    };
  }, [pathname, open, show, close]);

  // A link inside the box changes the page: close it.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Opening: fresh box, focused input, no page scroll behind it.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Searching, 220ms after typing stops.
  const q = query.trim();
  useEffect(() => {
    if (!open || q.length < 2 || FEDIVERSE_HANDLE.test(q)) {
      setWriters([]);
      setEntries([]);
      setTags([]);
      setSeries([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(async () => {
      trackFeature("search");
      const [w, e, t, s] = await Promise.all([
        getList<Writer>("users", q, controller.signal),
        getList<Entry>("entries", q, controller.signal),
        getList<Tag>("tags", q, controller.signal),
        getList<Series>("series", q, controller.signal),
      ]);
      if (controller.signal.aborted) return;
      setWriters(w.slice(0, 5));
      setEntries(e.filter((x) => x.author && x.slug).slice(0, 6));
      setTags(t.slice(0, 8));
      setSeries(s.slice(0, 3));
      setLoading(false);
    }, 220);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [q, open]);

  const pages = useMemo(() => {
    const base = signedIn ? MEMBER_PAGES : VISITOR_PAGES;
    const all =
      signedIn && username
        ? [{ label: "Your journal", href: `/${username}`, words: "profile my page" }, ...base]
        : base;
    if (!q) return all.slice(0, signedIn ? 8 : 6);
    const needle = q.toLowerCase().replace(/^[@#]/, "");
    // Word starts only, so "po" finds Posts and Polls, not "support".
    const starts = (text: string) => text.toLowerCase().split(/[\s']+/).some((w) => w.startsWith(needle));
    return all.filter((p) => starts(p.label) || starts(p.words)).slice(0, 4);
  }, [q, signedIn, username]);

  const handle = FEDIVERSE_HANDLE.test(q) ? q.replace(/^@?/, "@") : null;
  const exploreHref = `/explore?q=${encodeURIComponent(q)}`;

  // Keyboard order: pages, writers, entries, tags, series, then "everything".
  const items: Item[] = useMemo(() => {
    const list: Item[] = [];
    if (handle) list.push({ key: "handle", href: exploreHref });
    pages.forEach((p) => list.push({ key: `p:${p.href}`, href: p.href }));
    writers.forEach((w) => list.push({ key: `w:${w.id}`, href: `/${w.username}` }));
    entries.forEach((e) => list.push({ key: `e:${e.id}`, href: `/${e.author!.username}/${e.slug}` }));
    tags.forEach((t) => list.push({ key: `t:${t.slug}`, href: `/tag/${encodeURIComponent(t.slug)}` }));
    series.forEach((s) => list.push({ key: `s:${s.id}`, href: `/${s.author.username}/series/${s.slug}` }));
    if (q && !handle) list.push({ key: "all", href: exploreHref });
    return list;
  }, [handle, exploreHref, pages, writers, entries, tags, series, q]);

  const indexOf = (key: string) => items.findIndex((i) => i.key === key);
  const activeKey = items[active]?.key;

  useEffect(() => {
    if (active >= items.length) setActive(Math.max(0, items.length - 1));
  }, [items.length, active]);

  useEffect(() => {
    if (!activeKey) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-qs-key="${CSS.escape(activeKey)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeKey]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (items.length ? (a + 1) % items.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (items.length ? (a - 1 + items.length) % items.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[active];
      if (item) go(item.href);
      else if (q) go(exploreHref);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      // Keep focus in the box: the results are reached with the arrow keys.
      e.preventDefault();
    }
  };

  if (!open || typeof document === "undefined") return null;

  const row = (key: string) => ({
    "data-qs-key": key,
    className: `qs-row${activeKey === key ? " qs-row--active" : ""}`,
    onMouseMove: (e: React.MouseEvent) => {
      if (e.clientX === pointer.current.x && e.clientY === pointer.current.y) return;
      pointer.current = { x: e.clientX, y: e.clientY };
      const i = indexOf(key);
      if (i !== active && i >= 0) setActive(i);
    },
    onClick: () => setOpen(false),
    role: "option" as const,
    "aria-selected": activeKey === key,
    id: `qs-${key}`,
  });

  const searched = q.length >= 2 && !handle;
  const nothing = searched && !loading && !writers.length && !entries.length && !tags.length && !series.length;

  return createPortal(
    <div className="qs-layer" data-floating-layer="">
      <div className="qs-backdrop" onClick={close} aria-hidden="true" />
      <div className="qs-panel" role="dialog" aria-modal="true" aria-label="Search Inkwell">
        <div className="qs-input-row">
          <SearchIcon size={18} />
          <input
            ref={inputRef}
            // Focused while the tap that opened the box is still being
            // handled, so phones raise the keyboard (a deferred focus() is
            // ignored by iOS).
            autoFocus
            className="qs-input"
            type="search"
            inputMode="search"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Search writers, posts, tags…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onInputKey}
            role="combobox"
            aria-expanded="true"
            aria-controls="qs-results"
            aria-activedescendant={activeKey ? `qs-${activeKey}` : undefined}
          />
          {loading && <span className="qs-spinner" aria-label="Searching" />}
          <button type="button" className="qs-esc" onClick={close} aria-label="Close search">
            <span className="qs-esc-key">Esc</span>
            <span className="qs-esc-word">Cancel</span>
          </button>
        </div>

        <div className="qs-results" id="qs-results" ref={listRef} role="listbox" aria-label="Results">
          {handle && (
            <Group title="On the fediverse">
              <Link href={exploreHref} {...row("handle")}>
                <RowIcon kind="globe" />
                <span className="qs-main">
                  Look up <strong>{handle}</strong>
                  <span className="qs-sub">Find this account and follow it from Inkwell</span>
                </span>
              </Link>
            </Group>
          )}

          {pages.length > 0 && (
            <Group title={q ? "Pages" : "Go to"}>
              {pages.map((p) => (
                <Link key={p.href} href={p.href} {...row(`p:${p.href}`)}>
                  <RowIcon kind="page" />
                  <span className="qs-main">{p.label}</span>
                </Link>
              ))}
            </Group>
          )}

          {writers.length > 0 && (
            <Group title="Writers">
              {writers.map((w) => (
                <Link key={w.id} href={`/${w.username}`} {...row(`w:${w.id}`)}>
                  <Avatar url={w.avatar_url} name={w.display_name || w.username} size={28} />
                  <span className="qs-main">
                    {w.display_name || w.username}
                    <span className="qs-sub">@{w.username}</span>
                  </span>
                </Link>
              ))}
            </Group>
          )}

          {entries.length > 0 && (
            <Group title="Posts">
              {entries.map((e) => (
                <Link key={e.id} href={`/${e.author!.username}/${e.slug}`} {...row(`e:${e.id}`)}>
                  <RowIcon kind="post" />
                  <span className="qs-main">
                    {entryLabel(e)}
                    <span className="qs-sub">by {e.author!.display_name || e.author!.username}</span>
                  </span>
                </Link>
              ))}
            </Group>
          )}

          {tags.length > 0 && (
            <Group title="Tags">
              <div className="qs-tags">
                {tags.map((t) => (
                  <Link
                    key={t.slug}
                    href={`/tag/${encodeURIComponent(t.slug)}`}
                    {...row(`t:${t.slug}`)}
                    className={`qs-tag${activeKey === `t:${t.slug}` ? " qs-tag--active" : ""}`}
                  >
                    #{t.tag}
                    <span className="qs-tag-count">{t.entries}</span>
                  </Link>
                ))}
              </div>
            </Group>
          )}

          {series.length > 0 && (
            <Group title="Series">
              {series.map((s) => (
                <Link key={s.id} href={`/${s.author.username}/series/${s.slug}`} {...row(`s:${s.id}`)}>
                  <RowIcon kind="series" />
                  <span className="qs-main">
                    {s.title}
                    <span className="qs-sub">
                      {s.entry_count} {s.entry_count === 1 ? "part" : "parts"} · by {s.author.display_name || s.author.username}
                    </span>
                  </span>
                </Link>
              ))}
            </Group>
          )}

          {nothing && <p className="qs-empty">Nothing found for “{q}” yet.</p>}

          {q && !handle && (
            <div className="qs-group">
            <Link href={exploreHref} {...row("all")}>
              <RowIcon kind="search" />
              <span className="qs-main">
                See everything for “{q}” in Explore
                <span className="qs-sub">Including posts from across the fediverse</span>
              </span>
            </Link>
            </div>
          )}

          {!q && (
            <p className="qs-hint">
              Search by name, @username, a word from a post, or #tag. Paste @name@server to find someone on the fediverse.
            </p>
          )}
        </div>

        <div className="qs-foot" aria-hidden="true">
          <span><kbd>↑</kbd><kbd>↓</kbd> to move</span>
          <span><kbd>Enter</kbd> to open</span>
          <span><kbd>/</kbd> or <kbd>⌘K</kbd> anywhere</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function RowIcon({ kind }: { kind: "page" | "post" | "series" | "globe" | "search" }) {
  const paths: Record<typeof kind, React.ReactNode> = {
    page: <path d="M5 12h13M13 6l6 6-6 6" />,
    post: (
      <>
        <path d="M7 3h7l4 4v14H7z" />
        <path d="M14 3v4h4M10 12h5M10 16h5" />
      </>
    ),
    series: (
      <>
        <path d="M5 4h4v16H5zM10 4h4v16h-4z" />
        <path d="M15.5 5.2l3.8-1 3.7 15.6-3.8 1z" />
      </>
    ),
    globe: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-4-4" />
      </>
    ),
  };
  return (
    <span className={`qs-glyph${kind === "page" ? " qs-glyph--page" : ""}`} aria-hidden="true">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        {paths[kind]}
      </svg>
    </span>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="qs-group" role="group" aria-label={title}>
      <div className="qs-group-title">{title}</div>
      {children}
    </div>
  );
}
