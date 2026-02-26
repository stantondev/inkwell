export interface AvatarFrameInfo {
  id: string;
  label: string;
  description: string;
  plusOnly: boolean;
}

export const AVATAR_FRAMES: AvatarFrameInfo[] = [
  // Free frames
  { id: "none", label: "None", description: "No frame", plusOnly: false },
  { id: "classic", label: "Classic", description: "Elegant ink-blue double ring", plusOnly: false },
  { id: "ink-ring", label: "Ink Ring", description: "Hand-drawn ink splatter", plusOnly: false },
  { id: "notebook", label: "Notebook", description: "Spiral-bound paper edge", plusOnly: false },
  { id: "wax-seal", label: "Wax Seal", description: "Red wax letter seal", plusOnly: false },
  // Plus frames
  { id: "gilded", label: "Gilded", description: "Ornate gold filigree", plusOnly: true },
  { id: "constellation", label: "Constellation", description: "Celestial star map", plusOnly: true },
  { id: "botanical", label: "Botanical", description: "Lush floral wreath", plusOnly: true },
  { id: "neon", label: "Neon", description: "Vibrant glow effect", plusOnly: true },
  { id: "stamp", label: "Postage", description: "Vintage postage stamp", plusOnly: true },
];

export const PLUS_FRAME_IDS = new Set(
  AVATAR_FRAMES.filter((f) => f.plusOnly).map((f) => f.id)
);

export function isFrameAvailable(frameId: string, subscriptionTier: string): boolean {
  if (!PLUS_FRAME_IDS.has(frameId)) return true;
  return subscriptionTier === "plus";
}
