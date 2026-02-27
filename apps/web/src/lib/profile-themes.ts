export interface ProfileTheme {
  id: string;
  name: string;
  description: string;
  /** CSS gradient or color for the theme picker preview swatch */
  preview: string;
  /** CSS custom properties to override on the profile page */
  vars: Record<string, string>;
  defaultFont?: string;
  /** CSS class applied to the profile wrapper div for structural overrides */
  themeClass?: string;
  /** Border radius style */
  borderStyle?: "rounded" | "sharp" | "pill";
  /** Spacing density */
  spacing?: "tight" | "normal" | "airy";
  /** Whether to show theme-specific decorative elements */
  decorations?: boolean;
}

export const PROFILE_THEMES: ProfileTheme[] = [
  {
    id: "default",
    name: "Inkwell Classic",
    description: "Fountain pen elegance",
    preview: "linear-gradient(135deg, #f5f5f5 0%, #e8eef7 100%)",
    vars: {},
    defaultFont: "lora",
    themeClass: "theme-classic",
    borderStyle: "rounded",
    spacing: "normal",
  },
  {
    id: "manuscript",
    name: "Manuscript",
    description: "Handwritten journal pages",
    preview: "linear-gradient(135deg, #fdf6e8 0%, #d4b896 100%)",
    vars: {
      "--profile-bg": "#fdf6e8",
      "--profile-surface": "#f8eed5",
      "--profile-surface-hover": "#f0e3c4",
      "--profile-accent": "#6b4423",
      "--profile-accent-light": "#f0e4d5",
      "--profile-foreground": "#3b2810",
      "--profile-muted": "#9c8468",
      "--profile-border": "#d8c8a8",
    },
    defaultFont: "georgia",
    themeClass: "theme-manuscript",
    borderStyle: "sharp",
    spacing: "normal",
    decorations: true,
  },
  {
    id: "broadsheet",
    name: "Broadsheet",
    description: "Modern editorial clarity",
    preview: "linear-gradient(135deg, #ffffff 0%, #f0f0f0 100%)",
    vars: {
      "--profile-bg": "#ffffff",
      "--profile-surface": "#fafafa",
      "--profile-surface-hover": "#f0f0f0",
      "--profile-accent": "#111111",
      "--profile-accent-light": "#f5f5f5",
      "--profile-foreground": "#1a1a1a",
      "--profile-muted": "#717171",
      "--profile-border": "#e5e5e5",
    },
    defaultFont: "default",
    themeClass: "theme-broadsheet",
    borderStyle: "sharp",
    spacing: "airy",
  },
  {
    id: "midnight-library",
    name: "Midnight Library",
    description: "Candlelit book stacks",
    preview: "linear-gradient(135deg, #1a1510 0%, #3d3020 50%, #d4a54a 100%)",
    vars: {
      "--profile-bg": "#1a1510",
      "--profile-surface": "#262015",
      "--profile-surface-hover": "#332a1c",
      "--profile-accent": "#d4a54a",
      "--profile-accent-light": "#2e2618",
      "--profile-foreground": "#e8dcc4",
      "--profile-muted": "#8a7d65",
      "--profile-border": "#3d3425",
    },
    defaultFont: "times",
    themeClass: "theme-midnight-library",
    borderStyle: "sharp",
    spacing: "tight",
    decorations: true,
  },
  {
    id: "botanical-press",
    name: "Botanical Press",
    description: "Garden journal warmth",
    preview: "linear-gradient(135deg, #f5f2ec 0%, #c8d8c0 50%, #5a7a54 100%)",
    vars: {
      "--profile-bg": "#f5f2ec",
      "--profile-surface": "#eae5db",
      "--profile-surface-hover": "#dfd8ca",
      "--profile-accent": "#5a7a54",
      "--profile-accent-light": "#e8efe6",
      "--profile-foreground": "#2d3a28",
      "--profile-muted": "#7d8a72",
      "--profile-border": "#c8c0b0",
    },
    defaultFont: "palatino",
    themeClass: "theme-botanical",
    borderStyle: "pill",
    spacing: "airy",
  },
  {
    id: "neon-terminal",
    name: "Neon Terminal",
    description: "Digital underground",
    preview: "linear-gradient(135deg, #0a0a0a 0%, #0d1a0d 50%, #39ff14 100%)",
    vars: {
      "--profile-bg": "#0a0a0a",
      "--profile-surface": "#141414",
      "--profile-surface-hover": "#1e1e1e",
      "--profile-accent": "#39ff14",
      "--profile-accent-light": "#0d1a0d",
      "--profile-foreground": "#d0d0d0",
      "--profile-muted": "#666666",
      "--profile-border": "#2a2a2a",
    },
    defaultFont: "courier",
    themeClass: "theme-terminal",
    borderStyle: "sharp",
    spacing: "tight",
  },
  {
    id: "watercolor",
    name: "Watercolor",
    description: "Soft painted canvases",
    preview: "linear-gradient(135deg, #faf7ff 0%, #e8d5f0 50%, #d0e8e0 100%)",
    vars: {
      "--profile-bg": "#faf7ff",
      "--profile-surface": "#f3eef8",
      "--profile-surface-hover": "#ece5f2",
      "--profile-accent": "#9b7ec8",
      "--profile-accent-light": "#f0e8f8",
      "--profile-foreground": "#3d2e5c",
      "--profile-muted": "#a899bb",
      "--profile-border": "#e0d5ee",
    },
    defaultFont: "palatino",
    themeClass: "theme-watercolor",
    borderStyle: "rounded",
    spacing: "airy",
    decorations: true,
  },
  {
    id: "zine",
    name: "Zine",
    description: "DIY cut-and-paste rebellion",
    preview: "linear-gradient(135deg, #fffef5 0%, #e63946 50%, #0a0a0a 100%)",
    vars: {
      "--profile-bg": "#fffef5",
      "--profile-surface": "#ffffff",
      "--profile-surface-hover": "#f5f5f0",
      "--profile-accent": "#e63946",
      "--profile-accent-light": "#fce8ea",
      "--profile-foreground": "#0a0a0a",
      "--profile-muted": "#5a5a5a",
      "--profile-border": "#0a0a0a",
    },
    defaultFont: "default",
    themeClass: "theme-zine",
    borderStyle: "sharp",
    spacing: "tight",
  },
];

/** Map old theme IDs to new ones for backwards compatibility */
export const LEGACY_THEME_MAP: Record<string, string> = {
  "cottagecore": "botanical-press",
  "vaporwave": "neon-terminal",
  "dark-academia": "midnight-library",
  "retro-web": "zine",
  "midnight": "midnight-library",
  "pastel": "watercolor",
  "ocean": "broadsheet",
};

export const PROFILE_FONTS: { id: string; name: string; family: string }[] = [
  { id: "default", name: "System Default", family: "system-ui, -apple-system, sans-serif" },
  { id: "lora", name: "Lora (Serif)", family: "var(--font-lora, Georgia, serif)" },
  { id: "courier", name: "Courier (Mono)", family: "'Courier New', Courier, monospace" },
  { id: "georgia", name: "Georgia (Serif)", family: "Georgia, 'Times New Roman', serif" },
  { id: "comic-sans", name: "Cursive", family: "cursive, 'Comic Sans MS'" },
  { id: "times", name: "Times New Roman", family: "'Times New Roman', Times, serif" },
  { id: "palatino", name: "Palatino", family: "'Palatino Linotype', 'Book Antiqua', Palatino, serif" },
  { id: "verdana", name: "Verdana (Sans)", family: "Verdana, Geneva, sans-serif" },
];

export const PROFILE_LAYOUTS = [
  { id: "classic", name: "Classic", description: "Two-column with sidebar" },
  { id: "wide", name: "Wide", description: "Full-width header, stacked sections" },
  { id: "minimal", name: "Minimal", description: "Clean and stripped-down" },
  { id: "magazine", name: "Magazine", description: "Editorial-style feature layout" },
];
