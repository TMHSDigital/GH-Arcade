export const GAME_ID = 'maze';

export const WIDTH = 800;
export const HEIGHT = 600;

/** Maze grid: 25 x 21 cells of 24px, centered below a HUD band. */
export const CELL = 24;
export const COLS = 25;
export const ROWS = 21;
export const GRID_X = (WIDTH - COLS * CELL) / 2;
export const GRID_Y = 72;

export const START_LIVES = 3;
export const EXTRA_LIFE_AT = 10000;

/** Speeds in cells per second. The runner and the chasers both get faster each level, the chasers more so. */
export const RUNNER_SPEED = 7.2;
export const RUNNER_SPEED_STEP = 0.3;
export const RUNNER_SPEED_MAX = 9;
export const CHASER_SPEED = 6.6;
export const CHASER_SPEED_STEP = 0.4;
export const CHASER_SPEED_MAX = 9.2;
export const SCARED_SPEED = 4;
export const TUNNEL_SPEED = 3.8;
export const EYES_SPEED = 15;
export const HOUSE_SPEED = 4;

/** Seconds a power cell keeps the chasers scared: shrinks each level to this floor. */
export const SCARED_TIME = 6.5;
export const SCARED_TIME_STEP = 0.7;
export const SCARED_TIME_MIN = 1.5;
/** The last stretch of a scare, when the chasers flash as a warning. */
export const SCARED_WARN = 2;

/** Alternating scatter / chase phases in seconds; after the last one the chasers hunt for good. */
export const MODE_SCHEDULE = [7, 20, 7, 20, 5];

/** Seconds after a round starts that each chaser leaves the house, shortened on later levels. */
export const RELEASE_TIMES = [0, 1.5, 5, 9];

export const POINTS_DOT = 10;
export const POINTS_POWER = 50;
/** Chasers caught during one scare: 200, 400, 800, 1600. */
export const POINTS_CHASER = 200;
/** Bonus chip appears after this many dots, for BONUS_TIME seconds. */
export const BONUS_AT = [60, 140];
export const BONUS_TIME = 9;
export const BONUS_POINTS = [100, 300, 500, 700, 1000, 2000];

export const READY_MS = 1600;
export const DEATH_MS = 1500;
export const CLEAR_MS = 1800;
export const CATCH_FREEZE_MS = 400;
