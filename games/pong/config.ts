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

/** How strong a CPU opponent is. */
export interface CpuProfile {
  /** Top paddle speed, in pixels per second. */
  speed: number;
  /** How far off its aim can be, in pixels (it misjudges faster balls more). */
  error: number;
  /** It starts tracking once the ball passes this fraction of the table width: lower reacts sooner. */
  react: number;
}

/** The CPU strengths the menu offers. `normal` is the plain VS CPU mode. */
export const CPU_PROFILES = {
  easy: { speed: 290, error: 58, react: 0.6 },
  normal: { speed: 400, error: 34, react: 0.45 },
  hard: { speed: 500, error: 16, react: 0.3 },
} as const satisfies Record<string, CpuProfile>;

export type CpuLevel = keyof typeof CPU_PROFILES;

/**
 * The Table Champion and Clean Sheet trophies are for beating the CPU at its normal strength or
 * harder. A win against the easy CPU still counts as a play and scores, but unlocks neither.
 */
export const TROPHY_LEVELS: readonly CpuLevel[] = ['normal', 'hard'];
