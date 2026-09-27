export const GAME_ID = 'pong';

export const WIDTH = 800;
export const HEIGHT = 600;

/** Playfield between the HUD band and the bottom edge. */
export const TOP = 60;
export const BOTTOM = HEIGHT - 16;

export const PADDLE_W = 14;
export const PADDLE_H = 92;
export const PADDLE_X = 40;
export const PADDLE_SPEED = 520;

export const BALL_SIZE = 12;
export const SERVE_SPEED = 380;
/** Each paddle hit speeds the ball up by this factor, to a cap. */
export const SPEEDUP = 1.06;
export const MAX_SPEED = 920;
/** Largest bounce angle off the paddle edge. */
export const MAX_ANGLE = (55 * Math.PI) / 180;
/** How much of the paddle's own movement is passed on to the ball as spin. */
export const SPIN = 0.25;

export const POINTS_TO_WIN = 7;
export const SERVE_DELAY_MS = 900;

/** CPU opponent: top speed, and how far off its aim can be (it misjudges faster balls more). */
export const CPU_SPEED = 400;
export const CPU_ERROR = 34;
/** The CPU starts tracking once the ball passes this fraction of the table width. */
export const CPU_REACT = 0.45;
