import { Cinzel_Decorative, UnifrakturMaguntia } from "next/font/google";

/** The gothic capital for the Blackletter initial. */
const blackletter = UnifrakturMaguntia({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-blackletter",
  display: "swap",
});

/**
 * The capital on an Illuminated tile: slim engraved capitals that read at a
 * glance. In UnifrakturMaguntia an H looks like an S, and the tile holds the
 * first letter of the entry's first word.
 */
const illuminated = Cinzel_Decorative({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-illuminated",
  display: "swap",
});

/** Put on the page so its first-letter styles can reach both fonts. */
export const initialFontVars = `${blackletter.variable} ${illuminated.variable}`;
