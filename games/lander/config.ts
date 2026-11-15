export const GAME_ID = 'lander';

export const WIDTH = 800;
export const HEIGHT = 600;

export const START_LIVES = 3;

/** Main engine acceleration at full burn, in pixels per second squared. */
export const THRUST = 85;
/** Turning speed in radians per second. */
export const TURN_SPEED = 2.4;
/** Fuel used per second of full burn. A tank holds about 100. */
export const FUEL_BURN = 8;

/** The fastest a lander may touch down and survive, in pixels per second. */
export const SAFE_VY = 45;
export const SAFE_VX = 25;
/** The most a lander may lean on touchdown, in radians (about 12 degrees). */
export const SAFE_TILT = 0.22;
/** A touchdown slower than this earns the soft landing bonus. */
export const SOFT_VY = 15;

/** Terrain is a line through points this many pixels apart (plus the two ends of the pad). */
export const SEGMENT = 20;
/** The highest and lowest the ground may reach. */
export const GROUND_TOP = 330;
export const GROUND_BOTTOM = 568;
/** A pad never sits higher than this, so there is always room to line up above it. */
export const PAD_TOP = 400;

/** Where the lander starts each attempt. */
export const SPAWN_Y = 80;
/** How close to the side walls the lander may fly. */
export const EDGE = 16;
/** How far above the top of the screen the lander may climb. */
export const CEILING = -60;

/** Points for a landing, before the pad, fuel and soft landing bonuses. */
export const POINTS_BASE = 50;
export const POINTS_PER_STAGE = 50;
/** The pad bonus is this divided by the pad width, so a narrow pad pays more. */
export const POINTS_PAD = 4800;
export const POINTS_PER_FUEL = 2;
export const POINTS_SOFT = 50;

/** Pause after a landing before the next stage, and after a crash before the retry. */
export const LANDED_PAUSE_MS = 1900;
export const RESPAWN_MS = 1600;
