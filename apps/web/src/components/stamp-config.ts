export interface StampInfo {
  label: string;
  description: string;
  icon: string;
  plusOnly?: boolean;
}

export const STAMP_CONFIG: Record<string, StampInfo> = {
  felt: {
    label: "Felt",
    description: "I felt this",
    icon: "/stamps/felt.svg",
  },
  holding_space: {
    label: "Holding Space",
    description: "Holding space for you",
    icon: "/stamps/holding-space.svg",
  },
  beautifully_said: {
    label: "Beautifully Said",
    description: "Beautifully said",
    icon: "/stamps/beautifully-said.svg",
  },
  rooting: {
    label: "Rooting For You",
    description: "Rooting for you",
    icon: "/stamps/rooting.svg",
  },
  throwback: {
    label: "Throwback",
    description: "What a throwback",
    icon: "/stamps/throwback.svg",
  },
  i_cannot: {
    label: "I Cannot",
    description: "I cannot",
    icon: "/stamps/i-cannot.svg",
  },
  supporter: {
    label: "From a Supporter",
    description: "From a supporter",
    icon: "/stamps/supporter.svg",
    plusOnly: true,
  },
};

export const STAMP_TYPES = Object.keys(STAMP_CONFIG);
