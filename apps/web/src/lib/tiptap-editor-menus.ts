import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

/**
 * Keyboard and "/" plumbing for the entry editor's pop-up menus.
 *
 * - Watches for a "/" typed at the start of a line or after a space, and
 *   reports the text typed after it (the "/" menu filters on it).
 * - Offers every key press to the page first, from inside ProseMirror, so an
 *   open menu can take Enter and the arrow keys before they split the line or
 *   move the cursor. (A handler on a wrapper element runs too late: the editor
 *   has already acted on the key by then.)
 * - Mod-k opens the link box.
 */

export interface SlashState {
  /** What's been typed after the "/". */
  query: string;
  /** Position of the "/" itself. */
  from: number;
  /** The cursor, at the end of the query. */
  to: number;
}

export interface EditorMenusOptions {
  onSlash: (state: SlashState | null) => void;
  /** Return true to stop the editor handling the key. */
  onKeyDown: (event: KeyboardEvent) => boolean;
  onLinkShortcut: () => void;
}

const slashKey = new PluginKey("inkwellSlash");

// "/" at the start of the text, or after whitespace, then up to 24
// characters with no spaces. "and/or" and "https://" don't open it.
const SLASH = /(?:^|\s)\/([^\s/]{0,24})$/;

export const EditorMenus = Extension.create<EditorMenusOptions>({
  name: "inkwellEditorMenus",

  addOptions() {
    return {
      onSlash: () => {},
      onKeyDown: () => false,
      onLinkShortcut: () => {},
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-k": () => {
        this.options.onLinkShortcut();
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    let current: SlashState | null = null;
    // The "/" the writer closed the menu on with Escape: it stays closed
    // until that slash is gone.
    let dismissedAt: number | null = null;

    const report = (next: SlashState | null) => {
      const same =
        (next === null && current === null) ||
        (next && current && next.from === current.from && next.to === current.to && next.query === current.query);
      current = next;
      if (!same) options.onSlash(next);
    };

    return [
      new Plugin({
        key: slashKey,
        view: () => ({
          update: (view, prevState) => {
            const { selection } = view.state;
            if (!selection.empty || !view.hasFocus()) return report(null);
            const $from = selection.$from;
            const parent = $from.parent;
            if (!parent.isTextblock || parent.type.spec.code) return report(null);
            const start = Math.max(0, $from.parentOffset - 40);
            const before = parent.textBetween(start, $from.parentOffset, undefined, "￼");
            const match = SLASH.exec(before);
            if (!match) {
              dismissedAt = null;
              return report(null);
            }
            const from = $from.pos - match[1].length - 1;
            if (dismissedAt === from) return report(null);
            // It opens only when the "/" has just been typed, then follows the
            // query as it grows. Clicking next to a "/word" already in the
            // text mustn't open it (Enter would then replace that word).
            const opening = !current && match[1] === "" && !view.state.doc.eq(prevState.doc);
            if (!opening && current?.from !== from) return report(null);
            report({ query: match[1], from, to: $from.pos });
          },
          destroy: () => report(null),
        }),
        props: {
          handleKeyDown: (_view, event) => {
            if (event.key === "Escape" && current) {
              dismissedAt = current.from;
              report(null);
              return true;
            }
            return options.onKeyDown(event);
          },
          handleDOMEvents: {
            blur: () => {
              report(null);
              return false;
            },
          },
        },
      }),
    ];
  },
});
