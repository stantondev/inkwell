import { Node, mergeAttributes } from "@tiptap/core";

export interface GalleryPhoto {
  imageId: string;
  caption: string;
  alt: string;
  order: number;
}

export type GalleryLayout = "grid" | "masonry" | "carousel" | "filmstrip" | "album";

export interface PhotoGalleryAttrs {
  layout: GalleryLayout;
  columns: number;
  photos: GalleryPhoto[];
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    photoGallery: {
      insertPhotoGallery: (attrs: PhotoGalleryAttrs) => ReturnType;
      updatePhotoGallery: (attrs: Partial<PhotoGalleryAttrs>) => ReturnType;
    };
  }
}

export const GALLERY_LAYOUTS: { value: GalleryLayout; label: string; plusOnly: boolean }[] = [
  { value: "grid", label: "Grid", plusOnly: false },
  { value: "masonry", label: "Masonry", plusOnly: false },
  { value: "carousel", label: "Carousel", plusOnly: true },
  { value: "filmstrip", label: "Filmstrip", plusOnly: true },
  { value: "album", label: "Album", plusOnly: true },
];

export interface PhotoGalleryOptions {
  onEdit?: (attrs: PhotoGalleryAttrs) => void;
}

export const PhotoGallery = Node.create<PhotoGalleryOptions>({
  name: "photoGallery",
  group: "block",
  atom: true,
  draggable: true,

  addOptions() {
    return {
      onEdit: undefined,
    };
  },

  addAttributes() {
    return {
      layout: { default: "grid" },
      columns: { default: 3 },
      photos: { default: [] },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-photo-gallery]",
        getAttrs: (el) => {
          const dom = el as HTMLElement;
          const layout = dom.getAttribute("data-gallery-layout") || "grid";
          const columns = parseInt(dom.getAttribute("data-gallery-columns") || "3", 10);

          const photos: GalleryPhoto[] = [];
          const figures = dom.querySelectorAll("figure[data-gallery-photo]");
          figures.forEach((fig) => {
            const imageId = fig.getAttribute("data-image-id") || "";
            const order = parseInt(fig.getAttribute("data-photo-order") || "0", 10);
            const img = fig.querySelector("img");
            const alt = img?.getAttribute("alt") || "";
            const figcaption = fig.querySelector("figcaption");
            const caption = figcaption?.textContent || "";
            photos.push({ imageId, caption, alt, order });
          });

          // Sort by order
          photos.sort((a, b) => a.order - b.order);

          return { layout, columns, photos };
        },
      },
    ];
  },

  renderHTML({ node }) {
    const { layout, columns, photos } = node.attrs as PhotoGalleryAttrs;

    const figures = (photos || []).map((photo: GalleryPhoto, idx: number) => {
      const children: unknown[] = [
        [
          "img",
          {
            src: `/api/images/${photo.imageId}`,
            alt: photo.alt || "",
            loading: "lazy",
          },
        ],
      ];

      if (photo.caption) {
        children.push(["figcaption", {}, photo.caption]);
      }

      return [
        "figure",
        {
          "data-gallery-photo": "",
          "data-image-id": photo.imageId,
          "data-photo-order": String(idx),
        },
        ...children,
      ];
    });

    return [
      "div",
      mergeAttributes({
        "data-photo-gallery": "",
        "data-gallery-layout": layout,
        "data-gallery-columns": String(columns),
      }),
      ...figures,
    ];
  },

  addCommands() {
    return {
      insertPhotoGallery:
        (attrs: PhotoGalleryAttrs) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs,
          });
        },
      updatePhotoGallery:
        (attrs: Partial<PhotoGalleryAttrs>) =>
        ({ commands, state }) => {
          const { from } = state.selection;
          const node = state.doc.nodeAt(from);
          if (node?.type.name !== "photoGallery") return false;
          return commands.updateAttributes("photoGallery", attrs);
        },
    };
  },

  addNodeView() {
    return ({ node: initialNode, getPos, editor: nodeEditor }) => {
      let currentNode = initialNode;
      const dom = document.createElement("div");
      dom.setAttribute("data-photo-gallery-wrapper", "");
      dom.style.cursor = "pointer";
      dom.style.position = "relative";

      // Render the gallery HTML inside the wrapper
      const renderContent = () => {
        const { layout, columns, photos } = currentNode.attrs as PhotoGalleryAttrs;
        const inner = document.createElement("div");
        inner.setAttribute("data-photo-gallery", "");
        inner.setAttribute("data-gallery-layout", layout);
        inner.setAttribute("data-gallery-columns", String(columns));

        (photos || []).forEach((photo: GalleryPhoto, idx: number) => {
          const figure = document.createElement("figure");
          figure.setAttribute("data-gallery-photo", "");
          figure.setAttribute("data-image-id", photo.imageId);
          figure.setAttribute("data-photo-order", String(idx));

          const img = document.createElement("img");
          img.src = `/api/images/${photo.imageId}`;
          img.alt = photo.alt || "";
          img.loading = "lazy";
          figure.appendChild(img);

          if (photo.caption) {
            const figcap = document.createElement("figcaption");
            figcap.textContent = photo.caption;
            figure.appendChild(figcap);
          }

          inner.appendChild(figure);
        });

        // Edit hint overlay
        const hint = document.createElement("div");
        hint.style.cssText = "position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.6);color:#fff;padding:2px 8px;border-radius:4px;font-size:0.75rem;pointer-events:none;opacity:0;transition:opacity 0.15s;z-index:2;";
        hint.textContent = "Double-click to edit";
        hint.setAttribute("data-gallery-hint", "");

        dom.innerHTML = "";
        dom.appendChild(inner);
        dom.appendChild(hint);
      };

      renderContent();

      // Show hint on hover
      dom.addEventListener("mouseenter", () => {
        const hint = dom.querySelector("[data-gallery-hint]") as HTMLElement;
        if (hint) hint.style.opacity = "1";
      });
      dom.addEventListener("mouseleave", () => {
        const hint = dom.querySelector("[data-gallery-hint]") as HTMLElement;
        if (hint) hint.style.opacity = "0";
      });

      // Double-click to edit
      dom.addEventListener("dblclick", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const onEdit = this.options.onEdit;
        if (onEdit) {
          // Select the node first
          const pos = typeof getPos === "function" ? getPos() : undefined;
          if (pos !== undefined) {
            nodeEditor.commands.setNodeSelection(pos);
          }
          onEdit(currentNode.attrs as PhotoGalleryAttrs);
        }
      });

      return {
        dom,
        update: (updatedNode) => {
          if (updatedNode.type.name !== "photoGallery") return false;
          currentNode = updatedNode;
          renderContent();
          return true;
        },
        destroy: () => {
          // cleanup
        },
      };
    };
  },
});
