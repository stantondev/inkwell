/**
 * Wrap a resolved DOM Range in an `<ink-mark>` element so it renders as
 * a highlight. Handles Ranges that cross element boundaries by splitting
 * them into per-text-node segments, since Range.surroundContents throws
 * on partial selection.
 *
 * We use a custom element name `<ink-mark>` (instead of `<mark>`) so
 * entry-author custom CSS can't accidentally hide or restyle our marks.
 * The element is defined declaratively in globals.css inside
 * `@layer marginalia` with higher cascade precedence than author styles.
 */

const MARK_TAG = "ink-mark";
const MARK_ATTR = "data-marginalia-id";

/**
 * Wrap the given range in one or more `<ink-mark>` elements. Idempotent:
 * if marks for this ID already exist inside the root, no-op.
 *
 * Returns the array of mark elements that were actually created.
 */
export function wrapRange(root: Node, range: Range, marginaliaId: string): HTMLElement[] {
  if (!range || range.collapsed) return [];

  const doc = root.ownerDocument ?? (root as unknown as Document);

  // Idempotency: skip if any mark for this ID already exists
  if (
    doc &&
    (root as Element).querySelector?.(`${MARK_TAG}[${MARK_ATTR}="${cssEscape(marginaliaId)}"]`)
  ) {
    return [];
  }

  // Gather the text nodes that the range touches
  const textNodes = collectTextNodesInRange(root, range);
  const marks: HTMLElement[] = [];

  for (const { node, startOffset, endOffset } of textNodes) {
    if (startOffset >= endOffset) continue;

    // Split the text node so we have a standalone Text node containing
    // only the part we want to wrap
    let target = node;
    if (startOffset > 0) {
      target = target.splitText(startOffset);
    }
    if (endOffset - startOffset < target.data.length) {
      target.splitText(endOffset - startOffset);
    }

    const mark = doc.createElement(MARK_TAG) as HTMLElement;
    mark.setAttribute(MARK_ATTR, marginaliaId);
    // Keep a class on the mark too so we can hook onto it via CSS that
    // doesn't rely on the custom element name being honoured everywhere
    mark.className = "inkwell-marginalia-mark";

    const parent = target.parentNode;
    if (parent) {
      parent.insertBefore(mark, target);
      mark.appendChild(target);
      marks.push(mark);
    }
  }

  return marks;
}

/**
 * Unwrap (remove) all marks for a given marginalia ID from the root,
 * restoring the original text content. Used when a note is deleted or
 * when re-computing the layout.
 */
export function unwrapMarks(root: Node, marginaliaId?: string): void {
  const selector = marginaliaId
    ? `${MARK_TAG}[${MARK_ATTR}="${cssEscape(marginaliaId)}"]`
    : MARK_TAG;

  const marks = Array.from((root as Element).querySelectorAll(selector));
  for (const mark of marks) {
    const parent = mark.parentNode;
    if (!parent) continue;
    while (mark.firstChild) {
      parent.insertBefore(mark.firstChild, mark);
    }
    parent.removeChild(mark);
    parent.normalize();
  }
}

interface TextNodeSegment {
  node: Text;
  startOffset: number;
  endOffset: number;
}

function collectTextNodesInRange(root: Node, range: Range): TextNodeSegment[] {
  const segments: TextNodeSegment[] = [];

  const doc = root.ownerDocument ?? (root as unknown as Document);
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!range.intersectsNode(node)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let node = walker.nextNode() as Text | null;
  while (node) {
    const nodeLength = node.data.length;
    let start = 0;
    let end = nodeLength;

    if (node === range.startContainer) {
      start = range.startOffset;
    }
    if (node === range.endContainer) {
      end = range.endOffset;
    }

    if (start < end) {
      segments.push({ node, startOffset: start, endOffset: end });
    }

    node = walker.nextNode() as Text | null;
  }

  return segments;
}

/** Minimal CSS.escape polyfill for older browsers / SSR fallback. */
function cssEscape(s: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(s);
  }
  return s.replace(/[^a-zA-Z0-9\-_]/g, (ch) => `\\${ch}`);
}

/**
 * Measure the bounding rect of all marks for a given marginalia ID,
 * returning the earliest top and latest bottom. Used by the margin
 * layout to position notes.
 */
export function measureMarks(
  root: Node,
  marginaliaId: string,
): { top: number; bottom: number; left: number; right: number } | null {
  const selector = `${MARK_TAG}[${MARK_ATTR}="${cssEscape(marginaliaId)}"]`;
  const marks = Array.from(
    (root as Element).querySelectorAll(selector),
  ) as HTMLElement[];
  if (marks.length === 0) return null;

  let top = Infinity;
  let bottom = -Infinity;
  let left = Infinity;
  let right = -Infinity;

  for (const mark of marks) {
    const rect = mark.getBoundingClientRect();
    if (rect.top < top) top = rect.top;
    if (rect.bottom > bottom) bottom = rect.bottom;
    if (rect.left < left) left = rect.left;
    if (rect.right > right) right = rect.right;
  }

  return { top, bottom, left, right };
}
