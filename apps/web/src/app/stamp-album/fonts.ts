import { Cedarville_Cursive, IM_Fell_English } from "next/font/google";

/** The hand the notes on the backs of stamps are written in. */
export const hand = Cedarville_Cursive({ weight: "400", subsets: ["latin"], variable: "--sb-font-hand", display: "swap" });

/** The album's printing: page titles, labels, the catalogue. */
export const fell = IM_Fell_English({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--sb-font-fell",
  display: "swap",
});
