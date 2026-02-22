import { PROFILE_THEMES, PROFILE_FONTS } from "./profile-themes";

export interface ProfileCustomization {
  profile_theme?: string | null;
  profile_font?: string | null;
  profile_background_color?: string | null;
  profile_accent_color?: string | null;
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
 */
export function buildProfileStyles(profile: ProfileCustomization): ProfileStyles {
  const theme = PROFILE_THEMES.find((t) => t.id === profile.profile_theme);
  const font = PROFILE_FONTS.find((f) => f.id === profile.profile_font);

  const bg =
    profile.profile_background_color ||
    theme?.vars["--profile-bg"] ||
    "var(--background)";
  const surface = theme?.vars["--profile-surface"] || "var(--surface)";
  const accent =
    profile.profile_accent_color ||
    theme?.vars["--profile-accent"] ||
    "var(--accent)";
  const foreground = theme?.vars["--profile-foreground"] || "var(--foreground)";
  const muted = theme?.vars["--profile-muted"] || "var(--muted)";
  const border = theme?.vars["--profile-border"] || "var(--border)";

  return {
    page: {
      background: profile.profile_background_url ? undefined : bg,
      color: foreground,
      fontFamily: font?.family || undefined,
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
