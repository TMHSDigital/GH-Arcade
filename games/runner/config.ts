export const GAME_ID = 'runner';

export const WIDTH = 800;
export const HEIGHT = 600;

export const GROUND_Y = 500;
/** The runner stays at this screen x; the world scrolls past. */
export const PLAYER_X = 170;
export const PLAYER_W = 26;
export const PLAYER_H = 46;
export const SLIDE_H = 22;

export const GRAVITY = 2500;
export const JUMP_VELOCITY = 860;
export const DOUBLE_JUMP_VELOCITY = 760;
/** Releasing jump early while rising keeps only this fraction of upward speed (short hops). */
export const JUMP_CUT = 0.45;
/** Swiping or pressing down in the air slams you to the ground at this speed. */
export const DIVE_VELOCITY = 1400;
/** Grace period after running off an edge during which you can still jump. */
export const COYOTE_MS = 90;
/** A jump pressed this long before landing still fires on landing. */
export const JUMP_BUFFER_MS = 130;
/** How long a touch-triggered slide lasts (keys and gamepad slide while held). */
export const TOUCH_SLIDE_MS = 650;

export const START_SPEED = 380;
export const MAX_SPEED = 920;
/** Speed gained per second of running. */
export const ACCELERATION = 9;

/** Pixels of world travelled per metre shown on the HUD. */
export const PX_PER_METRE = 12;
export const COIN_POINTS = 25;
