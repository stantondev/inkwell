// Cleans HTML pasted from Google Docs, Word and web pages before the editor
// reads it. Without this:
// - Google Docs text arrived with an explicit colour on every run (black,
//   invisible in dark mode) and its links underlined twice; the <br>s it puts
//   between paragraphs became extra blank paragraphs.
// - Word left its list bullets ("·", "o", "1.") as typed characters in plain
//   paragraphs, plus mso-* styles, <o:p> tags and conditional comments.
// Copying within the editor itself (ProseMirror's own clipboard format) is
// left alone.

const LIST_MARKER = /^\s*(?:[·•▪◦o§-]|\d{1,3}[.)]|[a-z][.)]|[ivxlc]{1,5}[.)])\s*$/i;

function isOrderedMarker(text: string): boolean {
  return /^\s*(?:\d{1,3}|[a-z]|[ivxlc]{1,5})[.)]\s*$/i.test(text);
}

/** Style properties worth keeping from a paste: the ones the editor turns
 * into formatting. Colours, fonts, sizes and spacing belong to the source. */
const KEEP_STYLE = new Set(["font-weight", "font-style", "text-decoration", "text-decoration-line", "text-align", "vertical-align"]);

function cleanStyle(el: HTMLElement) {
  const style = el.getAttribute("style");
  if (!style) return;
  const kept = style
    .split(";")
    .map((part) => part.trim())
    .filter((part) => {
      const prop = part.split(":")[0]?.trim().toLowerCase();
      return prop && KEEP_STYLE.has(prop);
    });
  if (kept.length) el.setAttribute("style", kept.join("; "));
  else el.removeAttribute("style");
}

export function cleanPastedHtml(html: string): string {
  if (!html || html.includes("data-pm-slice")) return html;
  if (typeof DOMParser === "undefined") return html;

  const doc = new DOMParser().parseFromString(html, "text/html");
  const body = doc.body;
  const fromWord = /urn:schemas-microsoft-com|class="?Mso|mso-/i.test(html);
  const fromDocs = /docs-internal-guid/.test(html);

  // Things that are never content
  body.querySelectorAll("style, script, meta, link, title, xml, o\\:p").forEach((el) => el.remove());
  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_COMMENT);
  const comments: Node[] = [];
  while (walker.nextNode()) comments.push(walker.currentNode);
  comments.forEach((c) => c.parentNode?.removeChild(c));
  // Word's namespaced tags (<o:p>, <w:…>): keep their text only
  body.querySelectorAll("*").forEach((el) => {
    if (el.tagName.includes(":")) el.replaceWith(...Array.from(el.childNodes));
  });

  // Google Docs wraps everything in <b style="font-weight:normal" id="docs-internal-guid-…">
  body.querySelectorAll('b[id^="docs-internal-guid"]').forEach((b) => b.replaceWith(...Array.from(b.childNodes)));

  // Word lists: paragraphs that start with a bullet or number in a
  // "mso-list:Ignore" span become real list items.
  if (fromWord) {
    const paragraphs = Array.from(body.querySelectorAll("p")).filter((p) => {
      const style = p.getAttribute("style") ?? "";
      return /mso-list/i.test(style) || /MsoListParagraph/i.test(p.className);
    });
    let list: HTMLElement | null = null;
    let lastParagraph: Element | null = null;
    for (const p of paragraphs) {
      const ignore = p.querySelector('span[style*="mso-list:Ignore" i], span[style*="mso-list: Ignore" i]');
      const markerText = ignore?.textContent ?? "";
      const ordered = isOrderedMarker(markerText);
      ignore?.remove();
      const contiguous = lastParagraph && lastParagraph.nextElementSibling === p && list && list.tagName === (ordered ? "OL" : "UL");
      if (!contiguous) {
        list = doc.createElement(ordered ? "ol" : "ul");
        p.before(list);
      }
      const li = doc.createElement("li");
      const inner = doc.createElement("p");
      inner.append(...Array.from(p.childNodes));
      li.append(inner);
      list!.append(li);
      lastParagraph = p;
      // Keep the paragraph in place until the next one is checked, so
      // "next sibling" still means "the next line in the document".
      p.replaceChildren();
      p.setAttribute("data-inkwell-remove", "");
    }
    body.querySelectorAll("[data-inkwell-remove]").forEach((p) => p.remove());
    // Stray markers Word left as text at the start of other paragraphs
    body.querySelectorAll("p > span:first-child").forEach((span) => {
      if (LIST_MARKER.test(span.textContent ?? "") && /mso/i.test(span.getAttribute("style") ?? "")) span.remove();
    });
  }

  // Google Docs puts a <br> between paragraphs; the paragraphs already have
  // their spacing.
  if (fromDocs) {
    Array.from(body.children).forEach((el) => {
      if (el.tagName === "BR") el.remove();
    });
    body.querySelectorAll("br.Apple-interchange-newline").forEach((br) => br.remove());
  }

  // Links: the link is enough; an underline or colour inside it is the
  // source's styling of links.
  body.querySelectorAll("a span, a u").forEach((el) => {
    if (el.tagName === "U") el.replaceWith(...Array.from(el.childNodes));
  });

  // Headings deeper than the editor offers become its smallest heading.
  body.querySelectorAll("h4, h5, h6").forEach((h) => {
    const h3 = doc.createElement("h3");
    h3.append(...Array.from(h.childNodes));
    h.replaceWith(h3);
  });

  // Styled spans (Docs puts every run of text in one) become plain tags:
  // bold, italic, underline (not inside links), strikethrough, super/subscript.
  // Everything else about them (fonts, sizes, colours) is dropped.
  body.querySelectorAll<HTMLElement>("span[style]").forEach((span) => {
    const style = (span.getAttribute("style") ?? "").toLowerCase();
    const weight = /font-weight:\s*(bold|[6-9]00)/.test(style);
    const italic = /font-style:\s*italic/.test(style);
    const underline = /text-decoration[^;]*underline/.test(style) && !span.closest("a");
    const strike = /text-decoration[^;]*line-through/.test(style);
    const sup = /vertical-align:\s*super/.test(style);
    const sub = /vertical-align:\s*sub/.test(style);
    let content: Node[] = Array.from(span.childNodes);
    for (const [on, tag] of [[weight, "strong"], [italic, "em"], [underline, "u"], [strike, "s"], [sup, "sup"], [sub, "sub"]] as const) {
      if (!on) continue;
      const wrap = doc.createElement(tag);
      wrap.append(...content);
      content = [wrap];
    }
    span.replaceWith(...content);
  });
  body.querySelectorAll<HTMLElement>("[style]").forEach((el) => cleanStyle(el));
  // Spans left with nothing to say
  body.querySelectorAll("span:not([style]):not([class]):not([data-type])").forEach((span) =>
    span.replaceWith(...Array.from(span.childNodes)),
  );
  body.querySelectorAll("[class]").forEach((el) => {
    if (/^Mso|^Apple-/i.test(el.getAttribute("class") ?? "")) el.removeAttribute("class");
  });
  body.querySelectorAll("font").forEach((f) => f.replaceWith(...Array.from(f.childNodes)));

  return body.innerHTML;
}
