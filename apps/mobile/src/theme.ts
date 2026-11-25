import { useColorScheme } from "react-native";

/** The same tokens as apps/web/src/app/globals.css (:root and its dark version). */
const light = {
  background: "#fafaf9",
  surface: "#ffffff",
  border: "#e7e5e4",
  foreground: "#1c1917",
  muted: "#78716c",
  accent: "#2d4a8a",
  onAccent: "#ffffff",
  danger: "#dc2626",
  scrim: "rgba(28, 25, 23, 0.35)",
};

const dark: typeof light = {
  background: "#0c0a09",
  surface: "#1c1917",
  border: "#292524",
  foreground: "#e7e5e4",
  muted: "#a8a29e",
  accent: "#93b4f0",
  onAccent: "#0c0a09",
  danger: "#f87171",
  scrim: "rgba(0, 0, 0, 0.55)",
};

export type Theme = typeof light;

export function useTheme(): Theme & { dark: boolean } {
  const scheme = useColorScheme();
  return scheme === "dark" ? { ...dark, dark: true } : { ...light, dark: false };
}

/** The serif Inkwell uses for labels (Android's built-in serif). */
export const SERIF = "serif";
