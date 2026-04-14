/**
 * Fuzzy anchor resolution for when exact quote matching fails.
 *
 * Strategy: scan the entry's normalized text for candidate windows the
 * size of the quote, score each by Levenshtein distance, and accept the
 * best candidate if its similarity clears a threshold AND the context
 * around it (prefix + suffix) also matches reasonably.
 *
 * This is the orphan-rescue path. If the entry was lightly edited in a
 * way that touched the quoted passage (e.g. a typo fix inside the quote),
 * this will recover the anchor. Heavy rewrites will still orphan.
 */

import { distance } from "fastest-levenshtein";
import type { AnchorData } from "./types";
import { normalizeText, offsetsToRange } from "./anchor";

const QUOTE_SIMILARITY_THRESHOLD = 0.78;
const CONTEXT_SIMILARITY_THRESHOLD = 0.5;
/** Sliding window step in characters. Smaller = more thorough, slower. */
const STEP = 1;
/** Cap the number of candidate windows we score per entry. */
const MAX_CANDIDATES = 20000;

function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const d = distance(a, b);
  const maxLen = Math.max(a.length, b.length);
  return 1 - d / maxLen;
}

/**
 * Extract the flat text content of a root node, without whitespace
 * normalization (offsets must match DOM nodes).
 */
function getFlatText(root: Node): string {
  const walker = (
    root.ownerDocument ?? (root as unknown as Document)
  ).createTreeWalker(root, NodeFilter.SHOW_TEXT);

  let text = "";
  let node = walker.nextNode();
  while (node) {
    text += (node as Text).data;
    node = walker.nextNode();
  }
  return text;
}

export interface FuzzyMatch {
  range: Range;
  similarity: number;
}

/**
 * Try to fuzzy-locate the stored anchor in `root`. Returns null if no
 * candidate clears the similarity threshold.
 */
export function fuzzyResolve(root: Node, anchor: AnchorData): FuzzyMatch | null {
  const target = normalizeText(anchor.quote_text);
  if (target.length === 0) return null;

  const flat = getFlatText(root);
  const flatNormalized = normalizeText(flat);
  if (flatNormalized.length < target.length / 2) return null;

  const windowSize = target.length;
  let bestScore = 0;
  let bestStart = -1;

  // Scan the normalized flat text in steps. We score against the
  // normalized copy, but remember the UN-normalized offset by mapping
  // back — since the only difference between them is whitespace
  // collapsing, we can approximate by scanning the raw text directly
  // using the same step size and accept a small offset drift. For MVP
  // precision this is fine because the Range we build will re-run
  // through the exact matcher on the next render.
  //
  // Simpler approach for MVP: just scan raw flat text with the raw
  // (un-normalized) target and rely on whitespace tolerance in the
  // threshold.
  const rawTarget = anchor.quote_text;
  const rawWindow = rawTarget.length;

  let count = 0;
  for (let i = 0; i + rawWindow <= flat.length; i += STEP) {
    if (count++ > MAX_CANDIDATES) break;
    const candidate = flat.slice(i, i + rawWindow);
    const score = similarity(rawTarget, candidate);
    if (score > bestScore) {
      bestScore = score;
      bestStart = i;
      if (score >= 0.98) break; // near-perfect; stop scanning
    }
  }

  if (bestStart < 0 || bestScore < QUOTE_SIMILARITY_THRESHOLD) return null;

  // Check that context around the candidate reasonably matches the
  // stored prefix/suffix. This is the disambiguation guard that
  // prevents us from matching the same common phrase in the wrong
  // location.
  const CONTEXT_CHARS = 32;
  const prefixCandidate = normalizeText(
    flat.slice(Math.max(0, bestStart - CONTEXT_CHARS), bestStart),
  );
  const suffixCandidate = normalizeText(
    flat.slice(bestStart + rawWindow, bestStart + rawWindow + CONTEXT_CHARS),
  );

  const prefixScore = anchor.quote_prefix
    ? similarity(normalizeText(anchor.quote_prefix), prefixCandidate)
    : 1;
  const suffixScore = anchor.quote_suffix
    ? similarity(normalizeText(anchor.quote_suffix), suffixCandidate)
    : 1;

  const contextScore = Math.min(prefixScore, suffixScore);
  if (contextScore < CONTEXT_SIMILARITY_THRESHOLD) return null;

  // Build a DOM Range from the flat-text offset
  const range = offsetsToRange(root, bestStart, bestStart + rawWindow);
  if (!range) return null;

  return { range, similarity: bestScore };
}
