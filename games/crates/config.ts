export const GAME_ID = 'crates';

/** Saved fewest moves per solved level (see progress.ts). */
export const BEST_KEY = `${GAME_ID}:best`;

export const WIDTH = 800;
export const HEIGHT = 600;

/** The play area the level is fitted and centered in, below the HUD and above the touch buttons. */
export const BOARD = { x: 40, y: 92, width: 720, height: 420 };
/** Largest cell size in pixels, so small early levels do not fill the whole screen. */
export const MAX_CELL = 56;

/** How long one step takes, in ms. */
export const STEP_MS = 110;
/** A held direction starts repeating after this many ms. */
export const REPEAT_DELAY_MS = 200;
/** The pause before the next level after a solve, in ms. */
export const SOLVED_MS = 1400;
