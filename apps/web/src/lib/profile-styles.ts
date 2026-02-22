import { PROFILE_THEMES, PROFILE_FONTS } from "./profile-themes";

export interface ProfileCustomization {
  profile_theme?: string | null;
  profile_font?: string | null;
  profile_background_color?: string | null;
  profile_accent_color?: string | null;
  profile_foreground_color?: string | null;
  profile_background_url?: string | null;
}

export interface ProfileStyles {
  page: Record<string, string | undefined>;
  surface: Record<string, string>;
  accent: string;
  muted: string;
  foreground: string;
  border: string;
}

/**
 * Resolves theme presets + custom overrides into concrete CSS values
 * for the profile page renderer.
 *
 * Sets CSS custom properties (--foreground, --ink, --muted, etc.) on the
 * page wrapper so that ALL descendant elements using var(--foreground) etc.
 * get theme-appropriate values — including .prose-entry content.
 */
export function buildProfileStyles(profile: ProfileCustomization): ProfileStyles {
  const theme = PROFILE_THEMES.find((t) => t.id === profile.profile_theme);
  const font = PROFILE_FONTS.find((f) => f.id === profile.profile_font);

  const bg =
    profile.profile_background_color ||
    theme?.vars["--profile-bg"] ||
    "var(--background)";
  const surface = theme?.vars["--profile-surface"] || "var(--surface)";
  const surfaceHover = theme?.vars["--profile-surface-hover"] || "var(--surface-hover)";
  const accent =
    profile.profile_accent_color ||
    theme?.vars["--profile-accent"] ||
    "var(--accent)";
  const accentLight = theme?.vars["--profile-accent-light"] || "var(--accent-light)";
  const foreground =
    profile.profile_foreground_color ||
    theme?.vars["--profile-foreground"] ||
    "var(--foreground)";
  const muted = theme?.vars["--profile-muted"] || "var(--muted)";
  const border = theme?.vars["--profile-border"] || "var(--border)";

  // Build CSS custom property overrides so descendant elements using
  // var(--foreground), var(--ink), var(--muted), etc. get themed values.
  // This is critical for .prose-entry which uses color: var(--ink).
  const cssVarOverrides: Record<string, string | undefined> = {};
  if (theme && theme.id !== "default") {
    cssVarOverrides["--background"] = bg;
    cssVarOverrides["--foreground"] = foreground;
    cssVarOverrides["--ink"] = foreground;
    cssVarOverrides["--surface"] = surface;
    cssVarOverrides["--surface-hover"] = surfaceHover;
    cssVarOverrides["--accent"] = accent;
    cssVarOverrides["--accent-light"] = accentLight;
    cssVarOverrides["--muted"] = muted;
    cssVarOverrides["--border"] = border;
  }

  // If user overrode specific colors manually, always set those vars
  if (profile.profile_foreground_color) {
    cssVarOverrides["--foreground"] = profile.profile_foreground_color;
    cssVarOverrides["--ink"] = profile.profile_foreground_color;
  }
  if (profile.profile_accent_color) {
    cssVarOverrides["--accent"] = profile.profile_accent_color;
  }
  if (profile.profile_background_color) {
    cssVarOverrides["--background"] = profile.profile_background_color;
  }

  // Override --serif so .prose-entry (which uses font-family: var(--serif))
  // inherits the profile font instead of always using Lora/Georgia
  if (font && font.id !== "default") {
    cssVarOverrides["--serif"] = font.family;
  }

  return {
    page: {
      background: profile.profile_background_url ? undefined : bg,
      color: foreground,
      fontFamily: font?.family || undefined,
      ...cssVarOverrides,
    },
    surface: {
      background: surface,
      borderColor: border,
    },
    accent,
    muted,
    foreground,
    border,
  };
}
