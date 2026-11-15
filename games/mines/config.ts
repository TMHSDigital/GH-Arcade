export const GAME_ID = 'mines';

export const WIDTH = 800;
export const HEIGHT = 600;

export type DifficultyId = 'easy' | 'medium' | 'hard';

export interface Difficulty {
  id: DifficultyId;
  /** Shown on the menu, the HUD and the game-over line. */
  label: string;
  cols: number;
  rows: number;
  mines: number;
  /** Points for clearing the board. */
  base: number;
  /** Seconds under which every second left adds `perSecond` points. */
  par: number;
  perSecond: number;
  /** Points per safe cell uncovered, for a board that was lost. */
  perCell: number;
}

/**
 * The boards are wider than tall to fill the landscape screen. Hard keeps the classic density (about
 * one cell in five) on a board whose cells stay big enough to tap. Every win on a harder board
 * outscores any win on an easier one, and any win outscores a loss on the same board.
 */
export const DIFFICULTIES: Record<DifficultyId, Difficulty> = {
  easy: { id: 'easy', label: 'EASY', cols: 9, rows: 9, mines: 10, base: 500, par: 120, perSecond: 5, perCell: 2 },
  medium: { id: 'medium', label: 'MEDIUM', cols: 18, rows: 12, mines: 36, base: 1500, par: 240, perSecond: 10, perCell: 4 },
  hard: { id: 'hard', label: 'HARD', cols: 24, rows: 14, mines: 70, base: 4000, par: 600, perSecond: 15, perCell: 6 },
};

export const DIFFICULTY_ORDER: readonly DifficultyId[] = ['easy', 'medium', 'hard'];

/** The daily board everyone shares. */
export const DAILY_DIFFICULTY: DifficultyId = 'medium';

/** The area the board is centered in. The HUD sits above it. */
export const BOARD_TOP = 64;
export const BOARD_BOTTOM = HEIGHT - 20;
export const BOARD_SIDE = 20;
/** Largest cell, so the easy board does not fill the whole screen. */
export const MAX_CELL = 52;

/** Delay between one ring of a flood reveal and the next, in ms. */
export const REVEAL_STEP_MS = 26;
/** Length of one cell's reveal flash, in ms. */
export const REVEAL_MS = 240;
/** The longest a flood reveal may take to play out, however large it is. */
export const REVEAL_MAX_MS = 700;

/** A touch held this long on a cell flags it instead of revealing it. */
export const LONG_PRESS_MS = 380;
/** A held direction moves the cursor again after this delay, then every CURSOR_REPEAT_MS. */
export const CURSOR_REPEAT_DELAY_MS = 260;
export const CURSOR_REPEAT_MS = 70;

/** On a loss, the other mines go off one after another this far apart, capped at MINE_CHAIN_MAX_MS. */
export const MINE_CHAIN_MS = 45;
export const MINE_CHAIN_MAX_MS = 1500;
/** Time from the last mine of a loss, or from a win, to the game-over screen. */
export const LOSS_END_DELAY_MS = 1100;
export const WIN_END_DELAY_MS = 1900;

/** The Quick Sweep trophy: an easy board cleared in this many seconds or fewer. */
export const SPEED_TROPHY_SECONDS = 30;

/** Saved best times, one per difficulty, in whole seconds. */
export const BEST_TIMES_KEY = 'mines:best-times';
