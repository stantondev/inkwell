export interface AvatarFrameInfo {
  id: string;
  label: string;
  description: string;
  plusOnly: boolean;
}

export const AVATAR_FRAMES: AvatarFrameInfo[] = [
  // Free frames
  { id: "none", label: "None", description: "No frame", plusOnly: false },
  { id: "classic", label: "Classic", description: "Ink-blue band with a cream mat", plusOnly: false },
  { id: "ink-ring", label: "Ink Ring", description: "A brushed ink circle on paper", plusOnly: false },
  { id: "notebook", label: "Notebook", description: "Spiral-bound ruled paper", plusOnly: false },
  { id: "wax-seal", label: "Wax Seal", description: "Pressed into red sealing wax", plusOnly: false },
  // Plus frames
  { id: "gilded", label: "Gilded", description: "Beaded gold portrait frame", plusOnly: true },
  { id: "constellation", label: "Constellation", description: "A night sky ringed in gold", plusOnly: true },
  { id: "botanical", label: "Botanical", description: "Laurel wreath tied with a ribbon", plusOnly: true },
  { id: "neon", label: "Neon", description: "Pink and blue neon tubes", plusOnly: true },
  { id: "stamp", label: "Postage", description: "A perforated Inkwell stamp", plusOnly: true },
];

export const PLUS_FRAME_IDS = new Set(
  AVATAR_FRAMES.filter((f) => f.plusOnly).map((f) => f.id)
);

export function isFrameAvailable(frameId: string, subscriptionTier: string): boolean {
  if (!PLUS_FRAME_IDS.has(frameId)) return true;
  return subscriptionTier === "plus";
}

// ── Avatar Animations (Plus Feature) ──────────────────────────────────

export interface AvatarAnimationInfo {
  id: string;
  label: string;
  description: string;
}

export const AVATAR_ANIMATIONS: AvatarAnimationInfo[] = [
  { id: "none", label: "None", description: "Static avatar" },
  { id: "float", label: "Float", description: "Gentle up-and-down bobbing" },
  { id: "glow", label: "Glow", description: "Soft pulsing shadow" },
  { id: "prismatic", label: "Prismatic", description: "Slow color-shifting hue cycle" },
  { id: "shimmer", label: "Shimmer", description: "Light sweep across the avatar" },
];

export const AVATAR_ANIMATION_IDS = new Set(
  AVATAR_ANIMATIONS.filter((a) => a.id !== "none").map((a) => a.id)
);
