export interface ProfileTheme {
  id: string;
  name: string;
  description: string;
  /** CSS gradient or color for the theme picker preview swatch */
  preview: string;
  /** CSS custom properties to override on the profile page */
  vars: Record<string, string>;
  defaultFont?: string;
}

export const PROFILE_THEMES: ProfileTheme[] = [
  {
    id: "default",
    name: "Default",
    description: "Classic Inkwell look",
    preview: "linear-gradient(135deg, #f5f5f5 0%, #e8e8e8 100%)",
    vars: {},
  },
  {
    id: "cottagecore",
    name: "Cottagecore",
    description: "Warm earth tones and gentle florals",
    preview: "linear-gradient(135deg, #f5e6d3 0%, #d4a574 100%)",
    vars: {
      "--profile-bg": "#faf3eb",
      "--profile-surface": "#f5e6d3",
      "--profile-surface-hover": "#eed8c4",
      "--profile-accent": "#8b6f47",
      "--profile-accent-light": "#f0e4d5",
      "--profile-foreground": "#4a3728",
      "--profile-muted": "#9e8b7a",
      "--profile-border": "#d4c4b0",
    },
    defaultFont: "georgia",
  },
  {
    id: "vaporwave",
    name: "Vaporwave",
    description: "Retro neon aesthetic",
    preview: "linear-gradient(135deg, #ff71ce 0%, #01cdfe 50%, #05ffa1 100%)",
    vars: {
      "--profile-bg": "#1a0033",
      "--profile-surface": "#2d004d",
      "--profile-surface-hover": "#3d0066",
      "--profile-accent": "#ff71ce",
      "--profile-accent-light": "#3d1a4d",
      "--profile-foreground": "#e0d0ff",
      "--profile-muted": "#9b7abf",
      "--profile-border": "#4a1a6b",
    },
    defaultFont: "courier",
  },
  {
    id: "dark-academia",
    name: "Dark Academia",
    description: "Moody libraries and old books",
    preview: "linear-gradient(135deg, #2c2416 0%, #5c4a32 100%)",
    vars: {
      "--profile-bg": "#1e1a14",
      "--profile-surface": "#2c2416",
      "--profile-surface-hover": "#3a3020",
      "--profile-accent": "#c4a265",
      "--profile-accent-light": "#2e2618",
      "--profile-foreground": "#e8dcc8",
      "--profile-muted": "#9a8b72",
      "--profile-border": "#4a3f30",
    },
    defaultFont: "times",
  },
  {
    id: "retro-web",
    name: "Retro Web",
    description: "GeoCities nostalgia, web 1.0 vibes",
    preview: "linear-gradient(135deg, #000080 0%, #008080 50%, #800080 100%)",
    vars: {
      "--profile-bg": "#000080",
      "--profile-surface": "#c0c0c0",
      "--profile-surface-hover": "#b0b0b0",
      "--profile-accent": "#ff00ff",
      "--profile-accent-light": "#e0c0e0",
      "--profile-foreground": "#000000",
      "--profile-muted": "#404040",
      "--profile-border": "#808080",
    },
    defaultFont: "comic-sans",
  },
  {
    id: "midnight",
    name: "Midnight",
    description: "Deep dark with cool blue accents",
    preview: "linear-gradient(135deg, #0a0a1a 0%, #1a1a3e 100%)",
    vars: {
      "--profile-bg": "#0a0a1a",
      "--profile-surface": "#12122a",
      "--profile-surface-hover": "#1a1a3e",
      "--profile-accent": "#6366f1",
      "--profile-accent-light": "#1e1e4b",
      "--profile-foreground": "#e2e8f0",
      "--profile-muted": "#64748b",
      "--profile-border": "#1e293b",
    },
  },
  {
    id: "pastel",
    name: "Pastel Dream",
    description: "Soft pastel rainbow",
    preview: "linear-gradient(135deg, #ffd6e0 0%, #c3f0ca 50%, #bde0fe 100%)",
    vars: {
      "--profile-bg": "#fef9ff",
      "--profile-surface": "#fff0f5",
      "--profile-surface-hover": "#ffe0ea",
      "--profile-accent": "#e879a8",
      "--profile-accent-light": "#fce8f0",
      "--profile-foreground": "#4a3347",
      "--profile-muted": "#b090a8",
      "--profile-border": "#f0d0e0",
    },
    defaultFont: "verdana",
  },
  {
    id: "ocean",
    name: "Ocean",
    description: "Deep sea blues and teals",
    preview: "linear-gradient(135deg, #0c2d48 0%, #145374 50%, #2e8b8b 100%)",
    vars: {
      "--profile-bg": "#0c2d48",
      "--profile-surface": "#145374",
      "--profile-surface-hover": "#186088",
      "--profile-accent": "#2ec4b6",
      "--profile-accent-light": "#0e3d5a",
      "--profile-foreground": "#e0f0f0",
      "--profile-muted": "#7fb8b0",
      "--profile-border": "#1a5c6e",
    },
  },
];

export const PROFILE_FONTS: { id: string; name: string; family: string }[] = [
  { id: "default", name: "System Default", family: "system-ui, -apple-system, sans-serif" },
  { id: "lora", name: "Lora (Serif)", family: "var(--font-lora, Georgia, serif)" },
  { id: "courier", name: "Courier (Mono)", family: "'Courier New', Courier, monospace" },
  { id: "georgia", name: "Georgia (Serif)", family: "Georgia, 'Times New Roman', serif" },
  { id: "comic-sans", name: "Comic Sans", family: "'Comic Sans MS', cursive" },
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
