/**
 * Shapes shared by the Halloween decorations (logo, drifting bats, the
 * trick-or-treat pumpkin, the stamp). Flat paths, no ids, so any number can
 * be on a page.
 */

// A bat in a 100 × 50 box, wings spread, body at (50, 20). The wings are
// separate paths so they can beat (rotating at the shoulders, 47,21 and
// 53,21), their roots tucked under the body so no gap opens mid-beat; the
// trailing edges scallop between the finger bones.
export const BAT_WING_R =
  "M49 18C55 17 59 11 66 9C76 6 88 7 98 13Q90 19 91 30Q83 25 77 34Q71 27 64 31Q59 26 54 28L49 29Z";
export const BAT_WING_L =
  "M51 18C45 17 41 11 34 9C24 6 12 7 2 13Q10 19 9 30Q17 25 23 34Q29 27 36 31Q41 26 46 28L51 29Z";
export const BAT_BODY =
  "M47.2 15.6L49.6 13.4L45.4 7.2ZM52.8 15.6L54.6 7.2L50.4 13.4ZM45.8 15.5A4.2 4.2 0 1 0 54.2 15.5A4.2 4.2 0 1 0 45.8 15.5ZM46 19C45.5 24 47.5 30 50 34C52.5 30 54.5 24 54 19C52.5 17.5 47.5 17.5 46 19Z";
/** The whole bat as one path, for still pictures (the stamp). */
export const BAT_D = BAT_WING_L + BAT_WING_R + BAT_BODY;

/** A ghost, 60 × 72, rising from its wavy hem. */
export const GHOST_D =
  "M30 2C14 2 4 14 4 32V70L12 64L20 70L30 63L40 70L48 64L56 70V32C56 14 46 2 30 2Z";
