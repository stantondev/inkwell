/**
 * "Download your page as a website": a .zip of plain HTML, CSS and pictures
 * that works on any static host (Neocities, GitHub Pages, a USB stick).
 *
 * index.html is the writer's page exactly as a visitor sees it, drawn by
 * Next with the `x-inkwell-export` header (app/[username]/page.tsx: no
 * buttons that need Inkwell, every entry listed, the guestbook drawn without
 * scripts), then every script removed. Each public entry and sticky gets a
 * plain page under entries/. Pictures, stylesheets and fonts are copied in
 * and every link to them rewritten; links elsewhere on Inkwell point back at
 * Inkwell. Only what's public goes in: the full backup is Settings → Data export.
 *
 * The zip streams out as it's built, so a big journal never sits in memory.
 */

import http from "node:http";
import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from "fflate";

import { getSite } from "@/lib/site";
import { allPublicEntries, type ExportEntry } from "./collect";

interface Fetched {
  status: number;
  type: string;
  body: Buffer;
}

/** A GET to this same Next server, as a signed-out visitor on the site's own host. */
function selfGet(path: string, headers: Record<string, string> = {}): Promise<Fetched> {
  const port = Number(process.env.PORT || 3000);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path,
        method: "GET",
        headers: { host: getSite().host, "user-agent": "Inkwell site export", ...headers },
        timeout: 60_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, type: String(res.headers["content-type"] ?? ""), body: Buffer.concat(chunks) }),
        );
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/svg+xml": "svg",
  "font/woff2": "woff2",
  "font/woff": "woff",
  "font/ttf": "ttf",
};

/** Paths on Inkwell whose files go into the export. */
const ASSET = /\/(?:api\/(?:images|avatars|banners|backgrounds|userpics|stamps)\/[^"'\s)&<>,]+(?:\?v=[A-Za-z0-9_.-]+)?|_next\/static\/[^"'\s)&<>,]+|(?:stamps|frames)\/[^"'\s)&<>,]+\.svg|(?:inkwell-logo|favicon)\.svg)/g;

/** Characters that may come right before an asset path (so it isn't part of a longer URL). */
const BEFORE = new Set(['"', "'", "(", ";", ",", " ", "\n"]);

export async function buildSiteExport(username: string, displayName: string): Promise<ReadableStream<Uint8Array>> {
  const site = getSite();
  const root = `${username}-inkwell/`;

  // Everything is read before the stream starts, so a failure is a clean error, not half a zip.
  const page = await selfGet(`/${encodeURIComponent(username)}`, { "x-inkwell-export": "1" });
  if (page.status !== 200) throw new Error(`page ${page.status}`);
  const [entries, stickies] = await Promise.all([allPublicEntries(username, "entry"), allPublicEntries(username, "sticky")]);
  const all = [...entries, ...stickies];
  const slugs = new Set(all.map((e) => e.slug));

  const indexRaw = stripScripts(page.body.toString("utf8"));
  const htmlAttrs = indexRaw.match(/<html([^>]*)>/)?.[1] ?? ' lang="en"';
  const bodyAttrs = indexRaw.match(/<body([^>]*)>/)?.[1] ?? "";

  // Stylesheets (small; read now so their fonts and pictures are known).
  const styles: { href: string; local: string; text: string }[] = [];
  for (const [, href] of indexRaw.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="(\/_next\/static\/[^"]+\.css)"/g)) {
    const res = await selfGet(href);
    if (res.status !== 200) continue;
    const name = decodeURIComponent(href.split("/").pop() ?? "style.css").replace(/[^A-Za-z0-9_.-]/g, "_");
    // Fonts are relative to the stylesheet ("../media/…"): make them site paths like the rest.
    const text = res.body
      .toString("utf8")
      .replace(/url\((["']?)(\.{1,2}\/[^)"']+)\1\)/g, (_m, q: string, rel: string) => `url(${q}${new URL(rel, `http://x${href}`).pathname}${q})`);
    styles.push({ href, local: `assets/${styles.length}-${name}`, text });
  }
  const cssPaths = styles.map((st) => st.local);

  const entryPages = all.map((e) => ({
    name: `entries/${e.slug}.html`,
    html: entryPage(e, { username, displayName, htmlAttrs, bodyAttrs, cssPaths, siteUrl: site.url }),
  }));

  // Every Inkwell file the pages and stylesheets use, in order of first use.
  const wanted = new Set<string>();
  for (const text of [indexRaw, ...styles.map((st) => st.text), ...entryPages.map((p) => p.html)]) {
    for (const src of assetPaths(text)) if (!src.endsWith(".css")) wanted.add(src);
  }

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const zip = new Zip((err, chunk, final) => {
        if (err) {
          controller.error(err);
          return;
        }
        controller.enqueue(chunk);
        if (final) controller.close();
      });
      const addText = (name: string, text: string) => {
        const f = new ZipDeflate(root + name, { level: 6 });
        zip.add(f);
        f.push(strToU8(text), true);
      };
      const addBinary = (name: string, data: Uint8Array) => {
        const f = new ZipPassThrough(root + name);
        zip.add(f);
        f.push(data, true);
      };

      try {
        // 1. The files, named once their type is known (static hosts go by extension).
        const names = new Map<string, string>(styles.map((st) => [st.href, st.local]));
        const queue = [...wanted];
        for (let i = 0; i < queue.length; i += 4) {
          const batch = await Promise.all(
            queue.slice(i, i + 4).map(async (src) => {
              const res = await selfGet(src, { accept: "image/avif,image/webp,image/*,*/*" }).catch(() => null);
              return { src, res };
            }),
          );
          for (const { src, res } of batch) {
            if (!res || res.status !== 200) continue;
            const local = withExtension(localName(src), res.type);
            names.set(src, local);
            addBinary(local, res.body);
          }
        }

        // 2. The pages and stylesheets, pointing at those files.
        for (const st of styles) addText(st.local, rewriteAssets(st.text, names, "../", site.url));
        let index = rewriteLinks(rewriteAssets(indexRaw, names, "", site.url), username, slugs, "", site.url);
        index = index.replace("</head>", `<link rel="stylesheet" href="assets/export.css"/></head>`);
        addText("index.html", index);
        for (const p of entryPages) addText(p.name, rewriteLinks(rewriteAssets(p.html, names, "../", site.url), username, slugs, "../", site.url));

        addText("assets/export.css", EXPORT_CSS);
        addText("README.txt", readme(displayName, username, site.url, all.length));
        zip.end();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

/** The Inkwell asset paths in some HTML or CSS. */
function assetPaths(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(ASSET)) {
    if (BEFORE.has(text[(m.index ?? 0) - 1] ?? " ")) out.push(m[0]);
  }
  return out;
}

/** Points every Inkwell asset path at its copy in the export; one that couldn't be copied points back at Inkwell. */
function rewriteAssets(text: string, names: Map<string, string>, prefix: string, siteUrl: string): string {
  return text.replace(ASSET, (match, offset: number, whole: string) => {
    if (!BEFORE.has(whole[offset - 1] ?? " ")) return match;
    const local = names.get(match);
    return local ? prefix + local : siteUrl + match;
  });
}

function withExtension(name: string, type: string): string {
  if (/\.[a-z0-9]{2,5}$/i.test(name)) return name;
  const ext = EXT[type.split(";")[0].trim().toLowerCase()];
  return ext ? `${name}.${ext}` : name;
}

/** Where an Inkwell file goes in the export (pictures get their extension once fetched). */
function localName(src: string): string {
  const path = src.split("?")[0];
  const clean = (s: string) => s.replace(/[^A-Za-z0-9_.-]/g, "_");
  if (path.startsWith("/_next/static/")) return `assets/${clean(path.slice("/_next/static/".length))}`;
  if (path.startsWith("/stamps/") || path.startsWith("/frames/")) return `assets${path}`;
  if (path.startsWith("/api/stamps/")) return `assets/stamps/${clean(path.slice("/api/stamps/".length))}`;
  if (path === "/inkwell-logo.svg" || path === "/favicon.svg") return `assets${path}`;
  const m = path.match(/^\/api\/(images|avatars|banners|backgrounds|userpics)\/(.+)$/);
  // No extension: static hosts and browsers sniff pictures, and the type isn't known until fetched.
  if (m) return m[1] === "images" ? `images/${clean(m[2])}` : `images/${m[1]}-${clean(m[2])}`;
  return `assets/${clean(path)}`;
}

/** Links between the pages point inside the export; links elsewhere on Inkwell point back at it. */
function rewriteLinks(html: string, username: string, slugs: Set<string>, prefix: string, siteUrl: string): string {
  return html.replace(/(href|action)="(\/[^"]*)"/g, (_m, attr: string, href: string) => {
    if (href.startsWith("//")) return `${attr}="${href}"`;
    const [path, hash] = href.split("#");
    const clean = path.split("?")[0];
    if (clean === `/${username}` || clean === `/${username}/`) return `${attr}="${prefix}index.html${hash ? `#${hash}` : ""}"`;
    const m = clean.match(/^\/([^/]+)\/([^/]+)$/);
    if (m && m[1] === username && slugs.has(decodeURIComponent(m[2]))) {
      return `${attr}="${prefix}entries/${decodeURIComponent(m[2])}.html${hash ? `#${hash}` : ""}"`;
    }
    return `${attr}="${siteUrl}${href}"`;
  });
}

function stripScripts(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<link[^>]+(?:rel="(?:modulepreload|preload|manifest|preconnect|dns-prefetch|apple-touch-startup-image|apple-touch-icon)")[^>]*\/?>/gi, "")
    // Inkwell's own site-wide feed; the writer's feed stays.
    .replace(/<link[^>]+href="[^"]*\/api\/explore\/feed\.xml"[^>]*\/?>/gi, "")
    .replace(/<noscript>[\s\S]*?<\/noscript>/gi, "");
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function entryPage(
  e: ExportEntry,
  o: { username: string; displayName: string; htmlAttrs: string; bodyAttrs: string; cssPaths: string[]; siteUrl: string },
): string {
  const sticky = e.kind === "sticky";
  const title = e.title || (sticky ? "A sticky" : "Untitled");
  const date = new Date(e.published_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  const words = e.word_count ?? 0;
  const minutes = words > 0 ? Math.max(1, Math.round(words / 230)) : 0;
  const meta = [date, minutes ? `${minutes} min read` : null, e.mood ? `Feeling ${e.mood}` : null].filter(Boolean).map((x) => esc(String(x))).join(" · ");
  const original = `${o.siteUrl}/${o.username}/${e.slug}`;
  const warning = (e as ExportEntry & { is_sensitive?: boolean; content_warning?: string | null }).is_sensitive
    ? (e as ExportEntry & { content_warning?: string | null }).content_warning || "Sensitive content"
    : null;
  const body = warning
    ? `<details class="export-cw"><summary>Content warning: ${esc(warning)}</summary><div class="prose-entry">${e.body_html}</div></details>`
    : `<div class="prose-entry">${e.body_html}</div>`;
  const cover = e.cover_image_id && !warning ? `<img class="export-cover" src="/api/images/${e.cover_image_id}" alt=""/>` : "";
  const tags = (e.tags ?? []).length
    ? `<p class="export-tags">${e.tags.map((t) => `<span>#${esc(t)}</span>`).join(" ")}</p>`
    : "";
  const css = o.cssPaths.map((p) => `<link rel="stylesheet" href="../${p}"/>`).join("");

  return `<!DOCTYPE html><html${o.htmlAttrs}><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${esc(title)} · ${esc(o.displayName)}</title><link rel="icon" href="/favicon.svg" type="image/svg+xml"/>${css}<link rel="stylesheet" href="../assets/export.css"/></head><body${o.bodyAttrs}><main class="export-page"><p class="export-back"><a href="/${esc(o.username)}">← ${esc(o.displayName)}</a></p><article class="export-article${sticky ? " export-sticky" : ""}"${sticky ? ` style="background: var(--sticky-${esc(e.sticky_color || "yellow")}, #fdf1a8)"` : ""}>${cover}${sticky ? "" : `<h1>${esc(title)}</h1>`}<p class="export-meta">${meta}</p>${body}${tags}</article><p class="export-origin">First published on Inkwell: <a href="${esc(original)}">${esc(original)}</a></p></main></body></html>`;
}

function readme(displayName: string, username: string, siteUrl: string, count: number): string {
  const when = new Date().toISOString().slice(0, 10);
  return `${displayName}'s page, from Inkwell (${siteUrl}/${username})
Saved ${when}. ${count} entr${count === 1 ? "y" : "ies"}.

This folder is a small website. Open index.html in a browser to look at it,
or put the whole folder on any web host that serves plain files:

  - Neocities (neocities.org): drag the files into your site's file manager.
  - GitHub Pages, Codeberg Pages, Netlify or your own server: upload the folder.
  - Or keep it on a USB stick. It works offline.

What's in it: your page as visitors see it, and a page for every public
entry and sticky (entries/). Pictures are in images/, styles and fonts in assets/.
Friends-only and private entries aren't included; for a full backup of
everything, use Settings → Data export on Inkwell.

Links to other people's pages, tags and footnotes go back to Inkwell.
`;
}

const EXPORT_CSS = `/* Added by the export: plain pages for each entry. */
.export-page { max-width: 44rem; margin: 0 auto; padding: 2rem 1rem 4rem; color: var(--foreground); }
body { background: var(--background); }
.export-back { margin-bottom: 1.25rem; font-size: 0.9rem; }
.export-back a, .export-origin a { color: var(--accent); }
.export-article { padding: 1.5rem; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }
.export-article h1 { font-family: var(--font-lora, Georgia, serif); font-size: 2rem; line-height: 1.2; margin: 0 0 0.4rem; }
.export-meta { color: var(--muted); font-size: 0.85rem; margin: 0 0 1.25rem; }
.export-cover { display: block; width: 100%; max-height: 26rem; object-fit: cover; border-radius: 8px; margin-bottom: 1.25rem; }
.export-tags { margin-top: 1.5rem; display: flex; flex-wrap: wrap; gap: 0.4rem; }
.export-tags span { padding: 0.15rem 0.6rem; border-radius: 9999px; border: 1px solid var(--border); color: var(--muted); font-size: 0.8rem; }
.export-sticky { border: none; color: #2b2620; box-shadow: 0 10px 24px -14px rgba(0,0,0,.4); font-family: var(--font-lora, Georgia, serif); font-size: 1.15rem; }
.export-sticky .export-meta { color: rgba(43,38,32,.6); }
.export-cw summary { cursor: pointer; color: var(--muted); margin-bottom: 1rem; }
.export-origin { margin-top: 1.5rem; color: var(--muted); font-size: 0.8rem; overflow-wrap: anywhere; }
.prose-entry img { max-width: 100%; height: auto; }
`;

/** For the unit tests (build.test.ts). */
export const _forTests = { rewriteLinks, rewriteAssets, assetPaths, localName, withExtension, stripScripts };
