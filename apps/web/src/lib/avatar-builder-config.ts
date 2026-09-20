/**
 * Avatar builder categories, derived from the hand-drawn alien art system
 * in lib/alien-avatar.ts. The UI shape ({ id, label, type, options }) is
 * unchanged from the previous DiceBear-backed build, so stored configs keep
 * the same { style, options } storage format.
 */
import {
  ALIEN_HEADS,
  ALIEN_EYES,
  ALIEN_ANTENNAE,
  ALIEN_MOUTHS,
  ALIEN_PROPS,
  ALIEN_SCENES,
  ALIEN_SKINS,
  ALIEN_BGS,
} from "./alien-avatar";

export interface AvatarOptionChoice {
  value: string;
  label: string;
  /** Hex (no leading #) for colour swatches. */
  hex?: string;
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

export interface AvatarConfig {
  style: string;
  options: Record<string, string>;
}

const fromLabelled = (rec: Record<string, { label: string }>): AvatarOptionChoice[] =>
  Object.entries(rec).map(([value, { label }]) => ({ value, label }));

const fromPalette = (rec: Record<string, { label: string; hex: string }>): AvatarOptionChoice[] =>
  Object.entries(rec).map(([value, { label, hex }]) => ({
    value,
    label,
    hex: hex.replace("#", ""),
  }));

const CHARACTER_CATEGORIES: AvatarOptionCategory[] = [
  { id: "head", label: "Head", type: "select", options: fromLabelled(ALIEN_HEADS) },
  { id: "eyes", label: "Eyes", type: "select", options: fromLabelled(ALIEN_EYES) },
  { id: "antenna", label: "Antennae", type: "select", options: fromLabelled(ALIEN_ANTENNAE) },
  { id: "mouth", label: "Mouth", type: "select", options: fromLabelled(ALIEN_MOUTHS) },
];

const SKIN_CATEGORY: AvatarOptionCategory = {
  id: "skin",
  label: "Skin",
  type: "color",
  options: fromPalette(ALIEN_SKINS),
};

const BG_CATEGORY: AvatarOptionCategory = {
  id: "bg",
  label: "Background",
  type: "color",
  options: fromPalette(ALIEN_BGS),
};

export const PORTRAIT_STYLE: AvatarBuilderStyle = {
  id: "portrait",
  label: "Portrait",
  description: "A literary alien, drawn in ink",
  categories: [
    ...CHARACTER_CATEGORIES,
    { id: "prop", label: "Props", type: "select", options: fromLabelled(ALIEN_PROPS) },
    SKIN_CATEGORY,
    BG_CATEGORY,
  ],
};

export const SCENE_STYLE: AvatarBuilderStyle = {
  id: "scene",
  label: "Scene",
  description: "A whole little world — best viewed large",
  categories: [
    { id: "scene", label: "Scene", type: "select", options: fromLabelled(ALIEN_SCENES) },
    ...CHARACTER_CATEGORIES,
    SKIN_CATEGORY,
    BG_CATEGORY,
  ],
};

export const AVATAR_STYLES: AvatarBuilderStyle[] = [PORTRAIT_STYLE, SCENE_STYLE];

/** Configs saved by the retired DiceBear styles resolve to the portrait builder. */
export function getStyleById(id: string): AvatarBuilderStyle {
  return AVATAR_STYLES.find((s) => s.id === id) ?? PORTRAIT_STYLE;
}

export function getDefaultOptionsForStyle(style: AvatarBuilderStyle): Record<string, string> {
  const opts: Record<string, string> = {};
  for (const cat of style.categories) {
    opts[cat.id] = cat.options[0].value;
  }
  return opts;
}

/**
 * True when a stored config can actually drive the current builder. Configs
 * from the retired DiceBear styles ("croodles", "croodlesNeutral") return
 * false, so the builder opens on a fresh portrait rather than a broken one.
 * Their already-rendered avatar_url keeps displaying either way.
 */
export function isSupportedConfig(config: AvatarConfig | null): boolean {
  return !!config && AVATAR_STYLES.some((s) => s.id === config.style);
}

export const DEFAULT_AVATAR_CONFIG: AvatarConfig = {
  style: PORTRAIT_STYLE.id,
  options: getDefaultOptionsForStyle(PORTRAIT_STYLE),
};
