export const GAME_ID = 'snake';

export const WIDTH = 800;
export const HEIGHT = 600;

/** Play field: 32 x 22 cells of 25px, below a 50px HUD band. */
export const CELL = 25;
export const COLS = 32;
export const ROWS = 22;
export const FIELD_TOP = HEIGHT - ROWS * CELL;

export const START_LENGTH = 4;
export const START_STEP_MS = 135;
export const MIN_STEP_MS = 55;
/** Each food shaves this much off the step time, down to MIN_STEP_MS. */
export const STEP_SPEEDUP_MS = 2.5;
/** Max turns buffered ahead, so quick double-taps (e.g. up then left) both register. */
export const TURN_BUFFER = 3;

export const FOOD_POINTS = 10;
/** Every Nth food spawns a bonus orb. */
export const BONUS_EVERY = 5;
export const BONUS_LIFETIME_MS = 6000;
export const BONUS_BASE_POINTS = 50;
