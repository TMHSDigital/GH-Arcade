import { NEON } from '../../shared/ui';

export const GAME_ID = 'match';

export const WIDTH = 800;
export const HEIGHT = 600;

/** Size of one board cell in pixels; the 8x8 board is 512 pixels square. */
export const CELL = 64;
export const BOARD_X = 256;
export const BOARD_Y = 60;
/** Center of the side panel left of the board. */
export const PANEL_X = 128;

/** Timed mode: seconds on the clock at the start, and what each match adds back. */
export const TIMED_SECONDS = 90;
export const TIME_PER_MATCH = 1;
/** The clock never banks more than this. */
export const MAX_SECONDS = 99;
/** Moves mode: swaps allowed in one game. */
export const MOVES = 30;

/** Animation timings in milliseconds. */
export const SWAP_MS = 140;
export const CLEAR_MS = 180;
/** Fall time per row dropped, plus a little so short drops still read. */
export const FALL_MS_PER_ROW = 55;
export const FALL_MS_BASE = 90;
export const SHUFFLE_MS = 420;

/** Show a hint after this long without a move. */
export const HINT_MS = 6000;
/** A drag this far (in pixels) from where it started swaps toward it. */
export const DRAG_SWAP = 22;
/** Hold a direction this long before the cursor starts repeating, then repeat this often. */
export const CURSOR_DELAY_MS = 220;
export const CURSOR_REPEAT_MS = 90;
/** A cascade this long shakes the screen. */
export const SHAKE_CHAIN = 3;

/**
 * Gem colors from the shared palette, so the colorblind setting applies. Each color also has its
 * own shape (see GemArt in the game scene), so no gem relies on color alone.
 */
export const GEM_TINTS: readonly number[] = [NEON.cyan, NEON.pink, NEON.yellow, NEON.green, NEON.orange, NEON.purple];
