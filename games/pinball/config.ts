export const GAME_ID = 'pinball';

export const WIDTH = 800;
export const HEIGHT = 600;

export const BALL_R = 9;
export const BALLS = 3;

/** Table slope pull, in px/s^2. */
export const GRAVITY = 1100;
export const MAX_SPEED = 1700;
/** Physics substeps per frame; keeps a fast ball from tunnelling through thin walls and flippers. */
export const SUBSTEPS = 10;

export const FLIPPER_LEN = 64;
export const FLIPPER_R = 7;
/** Flipper swing speed in radians per second. */
export const FLIPPER_SPEED = 22;
/** Rest and raised angles for the left flipper, in radians; the right one mirrors them. */
export const FLIPPER_REST = (30 * Math.PI) / 180;
export const FLIPPER_UP = (-30 * Math.PI) / 180;

/** Plunger: seconds to full charge, and launch speed from no charge to full. */
export const PLUNGE_CHARGE_TIME = 1;
export const LAUNCH_MIN = 1100;
export const LAUNCH_MAX = 1900;

export const BUMPER_KICK = 520;
export const SLING_KICK = 430;
/** Seconds after a launch during which a drained ball comes back. */
export const BALL_SAVE_TIME = 8;
export const MAX_MULTIPLIER = 5;

export const POINTS_BUMPER = 100;
export const POINTS_SLING = 50;
export const POINTS_LANE = 250;
export const POINTS_LANES_DONE = 1000;
export const POINTS_TARGET = 200;
export const POINTS_BANK = 1500;
export const POINTS_STANDUP = 300;
