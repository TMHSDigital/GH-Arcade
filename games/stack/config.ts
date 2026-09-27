import type { PieceType } from './logic';

export const GAME_ID = 'stack';

export const WIDTH = 800;
export const HEIGHT = 600;

export const CELL = 26;
export const BOARD_X = (WIDTH - 10 * CELL) / 2;
export const BOARD_Y = 40;

/** Delayed auto shift: hold a direction this long before it starts repeating. */
export const DAS_MS = 160;
/** Auto repeat rate once DAS kicks in. */
export const ARR_MS = 40;
/** Seconds per row while soft dropping (or gravity, if that's already faster). */
export const SOFT_DROP_SECONDS = 0.03;
/** A grounded piece locks after this long without moving. */
export const LOCK_DELAY_MS = 500;
/** Moves or rotations that can reset the lock timer before it locks anyway. */
export const MAX_LOCK_RESETS = 15;
export const LINES_PER_LEVEL = 10;
export const NEXT_PREVIEW = 3;
/** Touch drag distance per column moved or row soft-dropped. */
export const DRAG_STEP = 28;

export const PIECE_COLORS: Record<PieceType, number> = {
  I: 0x00f0ff,
  O: 0xffe45e,
  T: 0xa45bff,
  S: 0x3dff8a,
  Z: 0xff2e97,
  J: 0x3d7bff,
  L: 0xff8a3d,
};
