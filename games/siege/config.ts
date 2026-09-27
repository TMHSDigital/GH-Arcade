export const GAME_ID = 'siege';

export const WIDTH = 800;
export const HEIGHT = 600;

/** Size of one pixel of sprite art, in game pixels. */
export const PX = 3;

export const PLAYER_Y = 548;
export const PLAYER_SPEED = 330;
export const PLAYER_BULLET_SPEED = 640;
export const START_LIVES = 3;
export const RESPAWN_MS = 1200;
export const INVULNERABLE_MS = 1600;

export const COLS = 11;
export const ROWS = 5;
export const COL_SPACING = 50;
export const ROW_SPACING = 40;
export const FORMATION_TOP = 110;
/** Each wave starts this much lower, up to MAX_WAVE_DROP. */
export const WAVE_DROP = 14;
export const MAX_WAVE_DROP = 70;
/** Horizontal step of the formation and how far it drops at each edge. */
export const STEP_X = 10;
export const STEP_DOWN = 18;
/** The formation steps faster as it thins out: interval = base + per-alien * aliens left. */
export const STEP_BASE_MS = 55;
export const STEP_PER_ALIEN_MS = 12;
/** The invasion succeeds if any alien gets this low. */
export const INVASION_Y = PLAYER_Y - 26;

export const ENEMY_BULLET_SPEED = 250;
export const MAX_ENEMY_BULLETS = 3;
export const ENEMY_FIRE_MS = 1100;

export const SHIELD_Y = 470;
export const SHIELD_CELL = 4;

export const MOTHERSHIP_Y = 72;
export const MOTHERSHIP_SPEED = 130;
export const MOTHERSHIP_MS: [number, number] = [16000, 26000];
export const MOTHERSHIP_POINTS = [50, 100, 150, 300];
