import { Cedarville_Cursive, IM_Fell_English } from "next/font/google";

/** The hand the letters are written in. */
export const hand = Cedarville_Cursive({ weight: "400", subsets: ["latin"], variable: "--dlo-hand", display: "swap" });

/** The office's own printing: labels, index cards, the clerk's notes. */
export const fell = IM_Fell_English({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--dlo-fell",
  display: "swap",
});
