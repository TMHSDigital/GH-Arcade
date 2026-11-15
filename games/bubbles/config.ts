export const GAME_ID = 'bubbles';

export const WIDTH = 800;
export const HEIGHT = 600;

/** Bubble radius in pixels. Every cell of the hex field is one bubble wide. */
export const R = 18;
/** Cells in an unshifted row; the shifted rows between them hold one fewer. */
export const COLS = 12;
/** Vertical distance between hex rows. */
export const ROW_H = R * Math.sqrt(3);
/** A bubble that settles in this row (counted from the ceiling) has crossed the line and ends the run. */
export const LOSE_ROW = 13;
/** Rows of bubbles in a fresh field. */
export const START_ROWS = 6;

/** The playfield in screen pixels: the walls sit at FIELD_X and FIELD_X + FIELD_W, the ceiling at FIELD_Y. */
export const FIELD_W = COLS * R * 2;
export const FIELD_X = (WIDTH - FIELD_W) / 2;
export const FIELD_Y = 46;
/** The launcher, in field coordinates. */
export const LAUNCH_X = FIELD_W / 2;
export const LAUNCH_Y = HEIGHT - 72 - FIELD_Y;

/** Bubble colors in a fresh run, and the most a run ever reaches. */
export const START_COLORS = 4;
export const MAX_COLORS = 6;
/** Chance that a generated bubble copies a neighbour's color, so fields start with some clusters. */
export const CLUSTER_CHANCE = 0.45;
/** The smallest same-color group that pops. */
export const MIN_GROUP = 3;

/** The level goes up every this many shots, and with every cleared field. */
export const SHOTS_PER_LEVEL = 25;
/** Shots in a row without a pop before the ceiling pushes a new row down, at level 1 and at the hardest. */
export const BASE_SHOTS_PER_DROP = 6;
export const MIN_SHOTS_PER_DROP = 3;

/** Steepest aim from straight up, in radians, either way. */
export const AIM_LIMIT = 1.3;
/** Keyboard and d-pad aim speed, radians per second (the stick scales it). */
export const AIM_SPEED = 1.6;
/** Flight speed of a fired bubble, pixels per second. */
export const SHOT_SPEED = 950;
/**
 * A flying bubble sticks when its centre comes this fraction of a bubble width from another one.
 * A little under 1 lets shots slip past near misses, which is how players expect the guide to behave.
 */
export const COLLIDE = 0.8;

export const POP_POINTS = 10;
export const DROP_POINTS = 20;
/** Consecutive popping shots multiply the score of a shot, up to this. */
export const MAX_STREAK = 4;
export const CLEAR_BONUS = 3000;
export const CLEAR_BONUS_PER_LEVEL = 500;
