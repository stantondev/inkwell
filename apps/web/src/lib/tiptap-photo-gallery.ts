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

export const PhotoGallery = Node.create({
  name: "photoGallery",
  group: "block",
  atom: true,
  draggable: true,

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
});
