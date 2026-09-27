export const GAME_ID = 'breakout';

export const WIDTH = 800;
export const HEIGHT = 600;

export const PADDLE_Y = HEIGHT - 48;
export const PADDLE_WIDTH = 110;
export const BALL_RADIUS = 8;
export const BALL_BASE_SPEED = 380;
export const BALL_SPEED_PER_LEVEL = 35;
export const BALL_MAX_SPEED = 720;
/** Largest bounce angle away from vertical when the ball hits the paddle edge. */
export const MAX_BOUNCE_ANGLE = (62 * Math.PI) / 180;

export const BRICK_W = 64;
export const BRICK_H = 22;
export const BRICK_GAP = 6;
export const BRICK_TOP = 90;
export const COLS = 10;

export const START_LIVES = 3;
export const POWERUP_CHANCE = 0.14;
export const WIDE_DURATION_MS = 12000;

export const COLORS = {
  cyan: 0x00f0ff,
  pink: 0xff2e97,
  yellow: 0xffe45e,
  green: 0x3dff8a,
  orange: 0xff8a3d,
  purple: 0xa45bff,
  white: 0xffffff,
} as const;

export const ROW_COLORS = [COLORS.pink, COLORS.orange, COLORS.yellow, COLORS.green, COLORS.cyan, COLORS.purple];

/**
 * Level layouts, one string per row, COLS characters wide.
 *   .  empty
 *   1  normal brick (1 hit)
 *   2  armored brick (2 hits)
 *   3  heavy brick (3 hits)
 * After the last level, layouts repeat with a faster ball.
 */
export const LEVELS: string[][] = [
  [
    '1111111111',
    '1111111111',
    '1111111111',
    '1111111111',
  ],
  [
    '..222222..',
    '.11111111.',
    '1111111111',
    '1111111111',
    '.11111111.',
    '..111111..',
  ],
  [
    '2.2.2.2.2.',
    '.1.1.1.1.1',
    '2.2.2.2.2.',
    '.1.1.1.1.1',
    '2.2.2.2.2.',
    '.1.1.1.1.1',
  ],
  [
    '3........3',
    '23......32',
    '1123..3211',
    '1112332111',
    '1111221111',
    '..111111..',
  ],
  [
    '3333333333',
    '2........2',
    '2.111111.2',
    '2.1.22.1.2',
    '2.111111.2',
    '2........2',
    '2222222222',
  ],
];
