export const GAME_ID = 'hop';

export const WIDTH = 800;
export const HEIGHT = 600;

/** Grid: 16 columns of 48px, 11 rows below a 48px HUD band. */
export const CELL = 48;
export const COLS = 16;
export const GRID_X = (WIDTH - COLS * CELL) / 2;
export const GRID_Y = 48;
export const START_COL = 7;
export const START_ROW = 10;

export const HOP_MS = 110;
export const START_LIVES = 3;
/** Seconds per life to reach a dock. */
export const TIME_LIMIT = 30;

export const POINTS_STEP = 10;
export const POINTS_DOCK = 50;
export const POINTS_PER_SECOND_LEFT = 10;
export const POINTS_FULL_HOUSE = 1000;
export const POINTS_ORB = 200;

/** Dock columns across the top row; the bank between them is solid. */
export const DOCK_COLS = [1, 4, 7, 10, 13];
/** A dock is 2 cells wide, starting at its column. */
export const DOCK_WIDTH = 2;

export type LaneKind = 'goal' | 'river' | 'safe' | 'road';

export interface LaneSpec {
  kind: LaneKind;
  /** Pixels per second at level 1; the sign is the direction. */
  speed?: number;
  /** Obstacle or platform length in cells, how many, and the gap pattern. */
  item?: 'car' | 'racer' | 'truck' | 'log' | 'turtle';
  length?: number;
  count?: number;
}

/** Lanes from the top (row 0) to the start pavement (row 10). */
export const LANES: LaneSpec[] = [
  { kind: 'goal' },
  { kind: 'river', speed: 70, item: 'log', length: 4, count: 3 },
  { kind: 'river', speed: -90, item: 'turtle', length: 2, count: 4 },
  { kind: 'river', speed: 110, item: 'log', length: 5, count: 2 },
  { kind: 'river', speed: -60, item: 'turtle', length: 3, count: 3 },
  { kind: 'safe' },
  { kind: 'road', speed: -80, item: 'truck', length: 2, count: 3 },
  { kind: 'road', speed: 150, item: 'racer', length: 1, count: 2 },
  { kind: 'road', speed: -100, item: 'car', length: 1, count: 4 },
  { kind: 'road', speed: 70, item: 'car', length: 1, count: 3 },
  { kind: 'safe' },
];

/** Traffic and river speed multiplier per level. */
export const SPEED_PER_LEVEL = 0.15;
