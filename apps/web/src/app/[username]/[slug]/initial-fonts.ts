import { UnifrakturMaguntia } from "next/font/google";

/** The gothic capital for the Blackletter and Inkwell Illuminated initials. */
export const blackletter = UnifrakturMaguntia({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-blackletter",
  display: "swap",
});
