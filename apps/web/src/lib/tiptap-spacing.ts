import { Extension } from "@tiptap/core";

export type SpacingValue = "tight" | "normal" | "loose";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    spacing: {
      setSpacing: (spacing: SpacingValue) => ReturnType;
      unsetSpacing: () => ReturnType;
    };
  }
}

export const Spacing = Extension.create({
  name: "spacing",

  addGlobalAttributes() {
    return [
      {
        types: [
          "paragraph",
          "heading",
          "bulletList",
          "orderedList",
          "blockquote",
          "taskList",
        ],
        attributes: {
          spacing: {
            // Typing starts "tight" (Enter goes to the next line, like a
            // notebook). Content that arrives as HTML — an imported post opened
            // here, a paste from a document, Markdown, the HTML view — keeps the
            // spacing it had: HTML without data-spacing is "normal". (Returning
            // null here made TipTap fall back to the default, so opening and
            // saving an imported post would have run all its paragraphs together.)
            default: "tight",
            parseHTML: (element) => element.getAttribute("data-spacing") || "normal",
            renderHTML: (attributes) => {
              if (!attributes.spacing || attributes.spacing === "normal") return {};
              return { "data-spacing": attributes.spacing };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setSpacing:
        (spacing: SpacingValue) =>
        ({ commands }) => {
          const value = spacing === "normal" ? null : spacing;
          const types = [
            "paragraph",
            "heading",
            "bulletList",
            "orderedList",
            "blockquote",
            "taskList",
          ];
          return types.some((type) =>
            commands.updateAttributes(type, { spacing: value })
          );
        },
      unsetSpacing:
        () =>
        ({ commands }) => {
          const types = [
            "paragraph",
            "heading",
            "bulletList",
            "orderedList",
            "blockquote",
            "taskList",
          ];
          return types.some((type) =>
            commands.resetAttributes(type, "spacing")
          );
        },
    };
  },
});
