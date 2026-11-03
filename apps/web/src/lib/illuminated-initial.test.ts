import { test } from "node:test";
import assert from "node:assert/strict";
import { illuminateHtml } from "./illuminated-initial";
import { entryOpening, entryPageStyle } from "./entry-page-style";

const text = (html: string) => html.replace(/<svg[\s\S]*?<\/svg><\/svg>/g, "").replace(/<[^>]+>/g, "");

test("the first letter goes on the tile and the text reads the same", () => {
  const html = "<p>Once upon a time</p><p>Then more.</p>";
  const lit = illuminateHtml(html, "vine")!;
  assert.match(lit, /^<p><span class="illum illum--vine"><svg/);
  assert.match(lit, /<span class="illum-letter">O<\/span><\/span>nce upon a time<\/p>/);
  assert.equal(text(lit), text(html));
});

test("it looks past inline tags and spaces to the first letter", () => {
  const lit = illuminateHtml('<p class="x"> <strong><em>Hello</em></strong> there</p>', "stars")!;
  assert.match(lit, /<strong><em><span class="illum illum--stars">.*<span class="illum-letter">H<\/span><\/span>ello/);
});

test("no tile when the entry doesn't open with a Latin letter in a paragraph", () => {
  assert.equal(illuminateHtml("<h2>Title</h2><p>Text</p>", "vine"), null);
  assert.equal(illuminateHtml("<p>“Quoted”</p>", "vine"), null);
  assert.equal(illuminateHtml("<p>Ωmega</p>", "vine"), null);
  assert.equal(illuminateHtml("<p><img src=x>Text</p>", "vine"), null);
});

test("gold ink gets the dark-letter tile", () => {
  assert.match(illuminateHtml("<p>Gold</p>", "garden", { onGold: true })!, /illum illum--garden illum--on-gold/);
});

test("entryOpening falls back to Classic when the text can't take a tile", () => {
  const style = entryPageStyle({ initial: "illuminated", illumination: "quill" });
  const ok = entryOpening(style, true, "<p>Ink</p>");
  assert.equal(ok.initial, "illuminated");
  assert.deepEqual(ok.illumination, { motif: "quill", onGold: false });
  const fallback = entryOpening(style, true, "<blockquote>Quote</blockquote>");
  assert.equal(fallback.initial, "classic");
  const untitled = entryOpening(style, false, "<p>Ink</p>");
  assert.equal(untitled.initial, "none");
  assert.equal(entryPageStyle({ illumination: "lasers" }).illumination, "vine");
});
