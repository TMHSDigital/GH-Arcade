export const GAME_ID = 'astro';

export const WIDTH = 800;
export const HEIGHT = 600;

export const SHIP_RADIUS = 12;
/** Radians per second at full turn input. */
export const TURN_SPEED = 4.4;
/** Pixels per second squared while thrusting. */
export const THRUST = 340;
export const MAX_SPEED = 430;
/** Fraction of velocity kept per second when coasting (space friction, for playability). */
export const DRAG_PER_SECOND = 0.55;

export const BULLET_SPEED = 580;
export const BULLET_LIFE_S = 0.85;
export const FIRE_COOLDOWN_MS = 170;
export const MAX_BULLETS = 6;

export const WARP_COOLDOWN_MS = 3000;
export const RESPAWN_DELAY_MS = 1400;
export const INVULNERABLE_MS = 2600;

export const START_LIVES = 3;
export const EXTRA_LIFE_EVERY = 10000;

/** Rock sizes: radius, score and speed range for large (3), medium (2) and small (1). */
export const ROCKS = {
  3: { radius: 44, points: 20, speed: [40, 80] },
  2: { radius: 24, points: 50, speed: [70, 130] },
  1: { radius: 12, points: 100, speed: [110, 190] },
} as const;
export type RockSize = keyof typeof ROCKS;

export const FIRST_WAVE_ROCKS = 4;
export const MAX_WAVE_ROCKS = 11;

export const UFO_FIRST_WAVE = 3;
export const UFO_RADIUS = 16;
export const UFO_POINTS = 500;
export const UFO_SPEED = 120;
export const UFO_FIRE_MS = 1300;
export const UFO_SPAWN_MS: [number, number] = [12000, 22000];
