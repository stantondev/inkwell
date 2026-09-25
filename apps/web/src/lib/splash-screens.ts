/**
 * iPhone and iPad screens for the installed app's launch screen
 * (apple-touch-startup-image). CSS points and device pixel ratio; the image
 * is w*dpr × h*dpr. iOS only shows a launch image whose media query matches
 * the device exactly, so every size needs its own entry.
 */
export const SPLASH_SIZES: { w: number; h: number; dpr: number }[] = [
  { w: 440, h: 956, dpr: 3 }, // iPhone 16 Pro Max
  { w: 402, h: 874, dpr: 3 }, // iPhone 16 Pro
  { w: 430, h: 932, dpr: 3 }, // iPhone 14/15 Pro Max, 15/16 Plus
  { w: 393, h: 852, dpr: 3 }, // iPhone 14/15 Pro, 15, 16
  { w: 428, h: 926, dpr: 3 }, // iPhone 12/13 Pro Max, 14 Plus
  { w: 390, h: 844, dpr: 3 }, // iPhone 12, 13, 14
  { w: 375, h: 812, dpr: 3 }, // iPhone X, XS, 11 Pro, 12/13 mini
  { w: 414, h: 896, dpr: 3 }, // iPhone XS Max, 11 Pro Max
  { w: 414, h: 896, dpr: 2 }, // iPhone XR, 11
  { w: 414, h: 736, dpr: 3 }, // iPhone 8 Plus
  { w: 375, h: 667, dpr: 2 }, // iPhone 8, SE (2nd/3rd)
  { w: 320, h: 568, dpr: 2 }, // iPhone SE (1st)
  { w: 1024, h: 1366, dpr: 2 }, // iPad Pro 12.9"
  { w: 834, h: 1194, dpr: 2 }, // iPad Pro 11"
  { w: 820, h: 1180, dpr: 2 }, // iPad Air, iPad (10th)
  { w: 744, h: 1133, dpr: 2 }, // iPad mini (6th)
];

export function splashStartupImages(): { url: string; media: string }[] {
  const out: { url: string; media: string }[] = [];
  for (const s of SPLASH_SIZES) {
    const base = `screen and (device-width: ${s.w}px) and (device-height: ${s.h}px) and (-webkit-device-pixel-ratio: ${s.dpr}) and (orientation: portrait)`;
    const px = `w=${s.w * s.dpr}&h=${s.h * s.dpr}`;
    out.push({ url: `/api/splash?${px}`, media: `${base} and (prefers-color-scheme: light)` });
    out.push({ url: `/api/splash?${px}&dark=1`, media: `${base} and (prefers-color-scheme: dark)` });
  }
  return out;
}
