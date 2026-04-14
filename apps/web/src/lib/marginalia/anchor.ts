/**
 * Text anchor computation and resolution for Inline Marginalia.
 *
 * Uses Apache Annotator's TextQuoteSelector matcher as the authoritative
 * anchoring strategy. See CLAUDE.md > "Inline Marginalia" for the design.
 *
 * The flow is:
 *   computeAnchor(root, range) → AnchorData    (on selection create)
 *   resolveAnchor(root, anchor) → Range | null (on every render)
 *
 * If the exact matcher fails, we fall back to a fuzzy Levenshtein scan
 * from fuzzy.ts. If fuzzy also fails, the anchor is orphaned.
 */

import { createTextQuoteSelectorMatcher } from "@apache-annotator/dom";
import type { AnchorData, ResolutionStatus } from "./types";
import { fuzzyResolve } from "./fuzzy";

/** Chars of context to store on each side of the quote. */
const CONTEXT_CHARS = 32;

/** Canonical whitespace normalizer — used on both sides of every comparison. */
export function normalizeText(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/\s+/gu, " ").trim();
}

/**
 * Walk a root node's text content into a flat string, returning both the
 * concatenated text AND a map from character offset → (text node, offset)
 * so callers can construct DOM Ranges from character positions.
 *
 * We intentionally do NOT run whitespace collapsing here — that happens
 * only in `normalizeText` for comparison purposes. Raw text preserves
 * offsets that line up with live DOM nodes.
 */
interface TextIndex {
  flat: string;
  chunks: Array<{ node: Text; start: number; end: number }>;
}

function buildTextIndex(root: Node): TextIndex {
  const walker = (
    root.ownerDocument ?? (root as unknown as Document)
  ).createTreeWalker(root, NodeFilter.SHOW_TEXT);

  let flat = "";
  const chunks: TextIndex["chunks"] = [];

  let node = walker.nextNode() as Text | null;
  while (node) {
    const text = node.data;
    if (text.length > 0) {
      chunks.push({ node, start: flat.length, end: flat.length + text.length });
      flat += text;
    }
    node = walker.nextNode() as Text | null;
  }

  return { flat, chunks };
}

/** Locate the (Text, offset) pair for a flat-text character offset. */
function locate(
  index: TextIndex,
  offset: number,
): { node: Text; localOffset: number } | null {
  // Clamp to string bounds
  if (offset < 0) offset = 0;
  if (offset > index.flat.length) offset = index.flat.length;

  // Binary search would be nicer for very long entries, but the corpus
  // size is small and linear is simpler + more obviously correct.
  for (const chunk of index.chunks) {
    if (offset >= chunk.start && offset <= chunk.end) {
      return { node: chunk.node, localOffset: offset - chunk.start };
    }
  }

  // If offset is past the end, land at the last chunk's end
  const last = index.chunks[index.chunks.length - 1];
  if (last) return { node: last.node, localOffset: last.node.data.length };
  return null;
}

/**
 * Given a DOM Range (typically from window.getSelection), extract the
 * anchor data we'll persist to the backend.
 *
 * We compute prefix/suffix from the surrounding text of `root` (not the
 * document) so context is stable even if the entry is embedded in a
 * larger page.
 */
export function computeAnchor(root: Node, range: Range): AnchorData {
  const index = buildTextIndex(root);

  // Find the start/end offsets of the range inside `root`'s text index
  const startOffset = offsetOfPoint(index, range.startContainer, range.startOffset);
  const endOffset = offsetOfPoint(index, range.endContainer, range.endOffset);

  if (startOffset < 0 || endOffset < 0 || endOffset <= startOffset) {
    // Fallback: use the range's stringified text and best-effort context
    const stringified = range.toString();
    return {
      quote_text: normalizeText(stringified),
      quote_prefix: "",
      quote_suffix: "",
      text_position_start: null,
      text_position_end: null,
    };
  }

  // IMPORTANT: Apache Annotator's TextQuoteSelector matcher does strict
  // character-by-character matching on `prefix + exact + suffix`. Any
  // normalization (e.g. trimming boundary whitespace) will cause the
  // matcher to never find the anchor. Store raw text here; normalization
  // is reserved for the dedup hash only.
  const quote_text = index.flat.slice(startOffset, endOffset);
  const prefix_start = Math.max(0, startOffset - CONTEXT_CHARS);
  const suffix_end = Math.min(index.flat.length, endOffset + CONTEXT_CHARS);
  const quote_prefix = index.flat.slice(prefix_start, startOffset);
  const quote_suffix = index.flat.slice(endOffset, suffix_end);

  return {
    quote_text,
    quote_prefix,
    quote_suffix,
    text_position_start: startOffset,
    text_position_end: endOffset,
  };
}

/** Find the character offset (in `index.flat`) of a (node, offset) DOM position. */
function offsetOfPoint(
  index: TextIndex,
  container: Node,
  offsetInContainer: number,
): number {
  // If the container is a Text node that's part of our index, just look it up.
  if (container.nodeType === Node.TEXT_NODE) {
    const chunk = index.chunks.find((c) => c.node === container);
    if (chunk) return chunk.start + offsetInContainer;
    return -1;
  }

  // If it's an Element node, `offsetInContainer` is a child index.
  // Walk descendants until we land on the Nth text node.
  if (container.nodeType === Node.ELEMENT_NODE) {
    const element = container as Element;
    const targetChild = element.childNodes[offsetInContainer] ?? null;

    if (targetChild && targetChild.nodeType === Node.TEXT_NODE) {
      const chunk = index.chunks.find((c) => c.node === targetChild);
      if (chunk) return chunk.start;
    }

    // Otherwise, find the first text node at or after this child index by
    // walking the element's subtree.
    if (targetChild) {
      for (const chunk of index.chunks) {
        if (element.contains(chunk.node)) {
          const compare = chunk.node.compareDocumentPosition(targetChild);
          if (
            compare & Node.DOCUMENT_POSITION_FOLLOWING ||
            compare === 0 ||
            chunk.node === targetChild
          ) {
            return chunk.start;
          }
        }
      }
    }

    // Range endpoint is at the very end of the element — return the
    // last chunk's end offset inside this element.
    const containedChunks = index.chunks.filter((c) =>
      element.contains(c.node),
    );
    if (containedChunks.length > 0) {
      return containedChunks[containedChunks.length - 1].end;
    }
  }

  return -1;
}

/**
 * Resolve a stored anchor against the live DOM. Tries exact match via
 * Apache Annotator first, then fuzzy fallback, then returns orphaned.
 */
export async function resolveAnchor(
  root: Node,
  anchor: AnchorData,
): Promise<ResolutionStatus> {
  // Try exact match via Apache Annotator
  try {
    const selector = {
      type: "TextQuoteSelector" as const,
      exact: anchor.quote_text,
      prefix: anchor.quote_prefix || undefined,
      suffix: anchor.quote_suffix || undefined,
    };

    const matcher = createTextQuoteSelectorMatcher(selector);

    const matches: Range[] = [];
    for await (const match of matcher(root as Node)) {
      matches.push(match as Range);
      // With both prefix and suffix, the first hit is authoritative.
      // Without either, keep collecting so we can disambiguate below.
      if (anchor.quote_prefix && anchor.quote_suffix) break;
      if (matches.length > 4) break;
    }

    if (matches.length === 1) {
      return { kind: "exact", range: matches[0] };
    }

    if (matches.length > 1 && anchor.text_position_start != null) {
      // Disambiguate by proximity to the stored character offset
      const index = buildTextIndex(root);
      const target = anchor.text_position_start;
      let best = matches[0];
      let bestDistance = Infinity;
      for (const m of matches) {
        const offset = offsetOfPoint(index, m.startContainer, m.startOffset);
        const d = Math.abs(offset - target);
        if (d < bestDistance) {
          bestDistance = d;
          best = m;
        }
      }
      return { kind: "exact", range: best };
    }

    if (matches.length > 0) {
      return { kind: "exact", range: matches[0] };
    }
  } catch (err) {
    // Fall through to fuzzy
    if (typeof console !== "undefined") {
      console.warn("[marginalia] exact matcher threw, falling back to fuzzy", err);
    }
  }

  // Fuzzy fallback
  const fuzzy = fuzzyResolve(root, anchor);
  if (fuzzy) {
    return { kind: "fuzzy", range: fuzzy.range, similarity: fuzzy.similarity };
  }

  return { kind: "orphaned" };
}

/** Build a stable locator for a Range so callers can re-find it later. */
export function rangeToOffsets(
  root: Node,
  range: Range,
): { start: number; end: number } | null {
  const index = buildTextIndex(root);
  const start = offsetOfPoint(index, range.startContainer, range.startOffset);
  const end = offsetOfPoint(index, range.endContainer, range.endOffset);
  if (start < 0 || end < 0 || end <= start) return null;
  return { start, end };
}

/** Construct a DOM Range from a pair of flat-text character offsets. */
export function offsetsToRange(
  root: Node,
  start: number,
  end: number,
): Range | null {
  const index = buildTextIndex(root);
  const a = locate(index, start);
  const b = locate(index, end);
  if (!a || !b) return null;

  const doc = root.ownerDocument ?? (root as unknown as Document);
  const range = doc.createRange();
  range.setStart(a.node, a.localOffset);
  range.setEnd(b.node, b.localOffset);
  return range;
}
