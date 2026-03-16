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
            default: "tight",
            parseHTML: (element) => element.getAttribute("data-spacing") || null,
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
