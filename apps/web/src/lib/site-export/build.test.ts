// Tests for "Download as a website" rewriting. Run: npm run test:arrange -w apps/web
import { test } from "node:test";
import assert from "node:assert/strict";

import { _forTests as x } from "./build";

const SITE = "https://inkwell.social";

test("scripts and app-only head links go; the writer's own feed stays", () => {
  const html = `<head><script src="/_next/a.js"></script><script>self.__next_f.push(1)</script><link rel="modulepreload" href="/x.js"/><link rel="manifest" href="/manifest.webmanifest"/><link href="/api/splash?w=1" media="x" rel="apple-touch-startup-image"/><link rel="alternate" type="application/rss+xml" href="https://inkwell.social/api/explore/feed.xml"/><link rel="alternate" type="application/rss+xml" href="https://inkwell.social/api/users/ann/feed.xml"/></head>`;
  const out = x.stripScripts(html);
  assert.ok(!out.includes("<script"));
  assert.ok(!out.includes("modulepreload") && !out.includes("manifest") && !out.includes("apple-touch-startup-image"));
  assert.ok(!out.includes("explore/feed.xml"));
  assert.ok(out.includes("/api/users/ann/feed.xml"));
});

test("pictures, drawings and fonts are found, not ones inside other URLs", () => {
  const html = `<img src="/api/images/abc-123"/><div style="background-image:url(&quot;/api/backgrounds/ann?v=9&quot;)"></div><img src="/stamps/felt.svg"/><a href="https://other.site/api/images/nope">x</a> url("/_next/static/media/f.woff2")`;
  assert.deepEqual(x.assetPaths(html), ["/api/images/abc-123", "/api/backgrounds/ann?v=9", "/stamps/felt.svg", "/_next/static/media/f.woff2"]);
});

test("files get names and extensions that static hosts serve", () => {
  assert.equal(x.localName("/api/images/abc-123"), "images/abc-123");
  assert.equal(x.localName("/api/avatars/ann?v=7"), "images/avatars-ann");
  assert.equal(x.localName("/_next/static/media/f.woff2"), "assets/media_f.woff2");
  assert.equal(x.localName("/frames/gilded.svg"), "assets/frames/gilded.svg");
  assert.equal(x.withExtension("images/abc-123", "image/avif"), "images/abc-123.avif");
  assert.equal(x.withExtension("images/abc-123", "image/jpeg; charset=binary"), "images/abc-123.jpg");
  assert.equal(x.withExtension("assets/media_f.woff2", "font/woff2"), "assets/media_f.woff2");
});

test("asset links point at the copies; one that couldn't be copied points back at Inkwell", () => {
  const names = new Map([["/api/images/abc", "images/abc.jpg"]]);
  const out = x.rewriteAssets(`<img src="/api/images/abc"/><img src="/api/images/gone"/>`, names, "../", SITE);
  assert.equal(out, `<img src="../images/abc.jpg"/><img src="${SITE}/api/images/gone"/>`);
});

test("links between the pages stay inside the export; the rest go to Inkwell", () => {
  const slugs = new Set(["my-day"]);
  const html = `<a href="/ann">home</a><a href="/ann/my-day#comments">entry</a><a href="/ann/private-one">not exported</a><a href="/tag/rain">tag</a><a href="//cdn.example/x">cdn</a><a href="https://elsewhere.org/">out</a>`;
  assert.equal(
    x.rewriteLinks(html, "ann", slugs, "../", SITE),
    `<a href="../index.html">home</a><a href="../entries/my-day.html#comments">entry</a><a href="${SITE}/ann/private-one">not exported</a><a href="${SITE}/tag/rain">tag</a><a href="//cdn.example/x">cdn</a><a href="https://elsewhere.org/">out</a>`,
  );
});
