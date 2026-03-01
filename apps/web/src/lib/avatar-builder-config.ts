export interface AvatarOptionChoice {
  value: string;
  label: string;
  plusOnly?: boolean;
}

export interface AvatarOptionCategory {
  id: string;
  label: string;
  type: "select" | "color";
  options: AvatarOptionChoice[];
}

export interface AvatarBuilderStyle {
  id: string;
  label: string;
  description: string;
  categories: AvatarOptionCategory[];
}

// DiceBear v9 Croodles option values — verified against @dicebear/croodles types
export const CROODLES_STYLE: AvatarBuilderStyle = {
  id: "croodles",
  label: "Croodles",
  description: "Hand-drawn doodle characters",
  categories: [
    {
      id: "face",
      label: "Face",
      type: "select",
      options: [
        { value: "variant01", label: "Classic" },
        { value: "variant02", label: "Round" },
        { value: "variant03", label: "Soft" },
        { value: "variant04", label: "Angular" },
        { value: "variant05", label: "Wide" },
        { value: "variant06", label: "Oval" },
        { value: "variant07", label: "Long" },
        { value: "variant08", label: "Square" },
      ],
    },
    {
      id: "top",
      label: "Hair",
      type: "select",
      options: Array.from({ length: 29 }, (_, i) => ({
        value: `variant${String(i + 1).padStart(2, "0")}`,
        label: `Style ${i + 1}`,
      })),
    },
    {
      id: "topColor",
      label: "Hair Color",
      type: "color",
      options: [
        { value: "2c1b18", label: "Black" },
        { value: "4a312c", label: "Dark Brown" },
        { value: "a55728", label: "Brown" },
        { value: "b58143", label: "Auburn" },
        { value: "d6b370", label: "Blonde" },
        { value: "e8e1e1", label: "Platinum" },
        { value: "c93305", label: "Red" },
        { value: "ecdcbf", label: "Strawberry" },
        { value: "724133", label: "Chestnut" },
        { value: "2d4a8a", label: "Ink Blue" },
      ],
    },
    {
      id: "eyes",
      label: "Eyes",
      type: "select",
      options: Array.from({ length: 16 }, (_, i) => ({
        value: `variant${String(i + 1).padStart(2, "0")}`,
        label: `Style ${i + 1}`,
      })),
    },
    {
      id: "mouth",
      label: "Mouth",
      type: "select",
      options: Array.from({ length: 18 }, (_, i) => ({
        value: `variant${String(i + 1).padStart(2, "0")}`,
        label: `Style ${i + 1}`,
      })),
    },
    {
      id: "nose",
      label: "Nose",
      type: "select",
      options: Array.from({ length: 9 }, (_, i) => ({
        value: `variant${String(i + 1).padStart(2, "0")}`,
        label: `Style ${i + 1}`,
      })),
    },
    {
      id: "beard",
      label: "Beard",
      type: "select",
      options: [
        { value: "__none", label: "None" },
        { value: "variant01", label: "Style 1" },
        { value: "variant02", label: "Style 2" },
        { value: "variant03", label: "Style 3" },
        { value: "variant04", label: "Style 4" },
        { value: "variant05", label: "Style 5" },
      ],
    },
    {
      id: "mustache",
      label: "Mustache",
      type: "select",
      options: [
        { value: "__none", label: "None" },
        { value: "variant01", label: "Style 1" },
        { value: "variant02", label: "Style 2" },
        { value: "variant03", label: "Style 3" },
        { value: "variant04", label: "Style 4" },
      ],
    },
    {
      id: "baseColor",
      label: "Background",
      type: "color",
      options: [
        { value: "f5ebe0", label: "Parchment" },
        { value: "fefae0", label: "Cream" },
        { value: "e9edc9", label: "Sage" },
        { value: "d5c7a3", label: "Tan" },
        { value: "ccd5ae", label: "Olive" },
        { value: "ddb892", label: "Warm" },
        { value: "b7c4cf", label: "Slate" },
        { value: "f2e9e4", label: "Blush" },
        { value: "ffffff", label: "White" },
      ],
    },
  ],
};

// DiceBear v9 Croodles Neutral — verified against @dicebear/croodles-neutral types
export const CROODLES_NEUTRAL_STYLE: AvatarBuilderStyle = {
  id: "croodlesNeutral",
  label: "Croodles Neutral",
  description: "Minimal doodle expressions",
  categories: [
    {
      id: "eyes",
      label: "Eyes",
      type: "select",
      options: Array.from({ length: 16 }, (_, i) => ({
        value: `variant${String(i + 1).padStart(2, "0")}`,
        label: `Style ${i + 1}`,
      })),
    },
    {
      id: "nose",
      label: "Nose",
      type: "select",
      options: Array.from({ length: 9 }, (_, i) => ({
        value: `variant${String(i + 1).padStart(2, "0")}`,
        label: `Style ${i + 1}`,
      })),
    },
    {
      id: "mouth",
      label: "Mouth",
      type: "select",
      options: Array.from({ length: 18 }, (_, i) => ({
        value: `variant${String(i + 1).padStart(2, "0")}`,
        label: `Style ${i + 1}`,
      })),
    },
  ],
};

export const AVATAR_STYLES: AvatarBuilderStyle[] = [CROODLES_STYLE, CROODLES_NEUTRAL_STYLE];

export function getStyleById(id: string): AvatarBuilderStyle {
  return AVATAR_STYLES.find((s) => s.id === id) ?? CROODLES_STYLE;
}

export function getDefaultOptionsForStyle(style: AvatarBuilderStyle): Record<string, string> {
  const opts: Record<string, string> = {};
  for (const cat of style.categories) {
    opts[cat.id] = cat.options[0].value;
  }
  return opts;
}

export const DEFAULT_AVATAR_CONFIG: AvatarConfig = {
  style: "croodles",
  options: getDefaultOptionsForStyle(CROODLES_STYLE),
};

export interface AvatarConfig {
  style: string;
  options: Record<string, string>;
}

// "__none" is a sentinel for optional categories (beard, mustache).
// When building DiceBear options, these map to probability=0 instead of a value.
export const OPTIONAL_CATEGORIES = new Set(["beard", "mustache"]);
