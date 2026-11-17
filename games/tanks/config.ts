export const GAME_ID = 'tanks';

export const WIDTH = 800;
export const HEIGHT = 600;

/** Height of the HUD band at the top. */
export const HUD_H = 72;

/** Generated ground stays between these heights (surface y, larger is lower). */
export const TERRAIN_TOP = 250;
export const TERRAIN_BOTTOM = 500;
/** Craters never dig below this line, so there is always some ground left. */
export const FLOOR_Y = HEIGHT - 24;

/** Where each tank may spawn: player one on the left, player two on the right. */
export const SPAWN_RANGES: readonly [readonly [number, number], readonly [number, number]] = [
  [70, 190],
  [WIDTH - 190, WIDTH - 70],
];

/** Tank body, drawn with its bottom center on the ground. */
export const TANK_W = 30;
export const TANK_H = 12;
export const TURRET_R = 8;
export const BARREL_LEN = 22;
/** A shell inside this radius of a tank's center counts as a direct hit. */
export const TANK_HIT_R = 15;
/** The hit center sits this far above the tank's base. */
export const TANK_CENTER_Y = 9;
/** Half the width of ground a tank rests on. */
export const TANK_FOOT = 11;
export const MAX_HP = 100;

/** Shell physics, in pixels and seconds. */
export const GRAVITY = 380;
/** Launch speed per point of power. */
export const POWER_SPEED = 7.2;
export const MIN_POWER = 10;
export const MAX_POWER = 100;
/** Wind ranges from -WIND_MAX to WIND_MAX; each point pushes the shell sideways this hard. */
export const WIND_MAX = 10;
export const WIND_ACCEL = 6;
/** Fixed simulation step, so the game, the hint and the CPU all agree on where a shell lands. */
export const SIM_DT = 1 / 240;
/** A shell still flying after this long is called a miss. */
export const MAX_FLIGHT_S = 12;
/** For this long after launch the shell cannot hit the tank that fired it. */
export const SAFE_LAUNCH_S = 0.2;
/** Shells leaving the screen sideways by more than this are gone. */
export const OUT_MARGIN = 60;

/** Explosions. */
export const CRATER_R = 32;
export const BLAST_R = 58;
export const MAX_DAMAGE = 45;
export const DIRECT_BONUS = 10;

/** Falling: drops shorter than FALL_SAFE are free, longer ones cost a little HP. */
export const FALL_SAFE = 10;
export const FALL_DAMAGE_PER_PX = 0.4;
export const MAX_FALL_DAMAGE = 25;
export const FALL_GRAVITY = 900;

/** Aiming rates for keys and sticks, per second. Holding Alt (Shift / X) aims at FINE_AIM of that. */
export const ANGLE_RATE = 55;
export const POWER_RATE = 40;
export const FINE_AIM = 0.25;
export const START_ANGLE = 50;
export const START_POWER = 60;

/** Touch aiming: start a drag within TOUCH_GRAB of your tank; DRAG_FULL pixels is full power. */
export const TOUCH_GRAB = 80;
export const DRAG_FULL = 200;
export const DRAG_MIN = 24;

/** The easy-mode trajectory hint shows the first this many seconds of the arc. */
export const HINT_SECONDS = 0.45;

/** Best of three. */
export const ROUNDS_TO_WIN = 2;

/** How strong a CPU opponent is. */
export interface CpuProfile {
  /** Largest aim error on its first shot, in degrees and power points. */
  angleError: number;
  powerError: number;
  /** How much of the wind it allows for (1 is all of it). */
  windSense: number;
  /** Each further shot in a round multiplies the error by this, so it zeroes in. */
  focus: number;
}

/** The CPU strengths the menu offers. `normal` is the plain VS CPU mode. */
export const CPU_PROFILES = {
  easy: { angleError: 7, powerError: 8, windSense: 0.4, focus: 0.8 },
  normal: { angleError: 4, powerError: 4.5, windSense: 0.8, focus: 0.6 },
  hard: { angleError: 1.5, powerError: 1.5, windSense: 1, focus: 0.45 },
} as const satisfies Record<string, CpuProfile>;

export type CpuLevel = keyof typeof CPU_PROFILES;

/** Wins against the easy CPU still score and keep the streak going, but do not lengthen it and earn no trophy. */
export const TROPHY_LEVELS: readonly CpuLevel[] = ['normal', 'hard'];

/** Score multiplier for beating each CPU strength. */
export const LEVEL_MULT: Record<CpuLevel, number> = { easy: 1, normal: 2, hard: 3 };

/** Saved vs-CPU win streak (shared/storage.ts adds the arcade prefix). */
export const STREAK_KEY = 'tanks-streak';
