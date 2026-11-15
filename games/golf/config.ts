export const GAME_ID = 'golf';

export const WIDTH = 800;
export const HEIGHT = 600;

/** The course grid: 20 columns by 13 rows of 40px cells, below a 64px HUD band. */
export const CELL = 40;
export const COLS = 20;
export const ROWS = 13;
export const GRID_X = (WIDTH - COLS * CELL) / 2;
export const GRID_Y = 64;

export const BALL_RADIUS = 7;
export const CUP_RADIUS = 11;

/** The physics runs in fixed steps of this many seconds, so a shot plays out the same at any frame rate. */
export const STEP = 1 / 120;

/** Rolling friction: a constant slowdown in px/s^2 plus a drag proportional to speed (per second). */
export const ROLL_DECEL = 220;
export const ROLL_DRAG = 0.6;
/** Sand grabs the ball much harder. */
export const SAND_DECEL = 1100;
export const SAND_DRAG = 2.4;
/** Share of the speed into a wall that comes back out of it. */
export const WALL_BOUNCE = 0.78;
/** Boost pads push the ball along their arrow, in px/s^2. */
export const BOOST_ACCEL = 1500;
export const MAX_SPEED = 1300;
/** Below this speed (px/s) the ball has come to rest. */
export const STOP_SPEED = 10;

/** Launch speeds for the weakest and the strongest shot, in px/s. */
export const MIN_SHOT = 60;
export const MAX_SHOT = 1000;

/** The ball drops when its center is over the cup and it is slower than this; faster balls roll over. */
export const CUP_SPEED = 430;
/** A slow ball near the cup is drawn toward it, so a putt that stops on the lip still falls. */
export const CUP_PULL = 500;
export const CUP_PULL_RANGE = CUP_RADIUS * 1.6;

/** Strokes on a hole stop here: the ball is picked up and the hole scores this many. */
export const MAX_STROKES = 10;
/** Penalty strokes for finding water. */
export const WATER_PENALTY = 1;
/** Points per stroke saved under the cap. The best score is therefore the lowest total. */
export const HOLE_POINTS = 100;
/** A roll that goes on longer than this (trapped on a pad) is called off and replayed. */
export const MAX_ROLL_SECONDS = 25;

/** How far the pointer is dragged back for a full-power shot, in px. */
export const DRAG_RANGE = 170;
/** Keyboard and d-pad aiming, in radians per second: left / right turn fast, up / down fine-tune. */
export const AIM_TURN = 2.2;
export const AIM_FINE = 0.45;
/** Seconds for a held charge to go from no power to full; it then falls back and rises again. */
export const CHARGE_SECONDS = 1.1;
