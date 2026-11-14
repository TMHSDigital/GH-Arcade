import {
  CELL,
  COLS,
  DOCK_COLS,
  DOCK_WIDTH,
  LANES,
  type LaneSpec,
  POINTS_DOCK,
  POINTS_ORB,
  POINTS_PER_SECOND_LEFT,
  SPEED_PER_LEVEL,
  START_ROW,
} from './config';

/**
 * Pure Neon Hop rules: the hop grid, lane layout, movement and wrapping, what is safe to stand on,
 * docks and their points. No Phaser here, so the rules can be tested; the scene owns input, timing,
 * drawing and sound. All x positions are pixels within the grid.
 */

export interface Item {
  /** Left edge in pixels (relative to the grid), wraps around. */
  x: number;
  w: number;
  /** Turtles only: phase offset for diving. */
  phase: number;
}

export interface Lane {
  row: number;
  kind: LaneSpec['kind'];
  item?: string;
  speed: number;
  items: Item[];
}

export const GRID_W = COLS * CELL;
/**
 * Lane items travel a loop this much longer than the grid on each side. The loop must be at least
 * the grid plus the longest item (5 cells), so an item can be completely hidden while it wraps.
 */
export const WRAP_MARGIN = CELL * 3;
/** The length of the loop a lane's items travel. */
export const LOOP = GRID_W + WRAP_MARGIN * 2;
export const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] } as const;
export type DirName = keyof typeof DIRS;

/** Why a life was lost while standing in a lane. */
export type Hazard = 'SPLAT' | 'SPLASH';

/** The centre x of a column. */
export function columnX(col: number): number {
  return col * CELL + CELL / 2;
}

/** The column a position is in (or nearest to, while riding between cells). */
export function columnAt(px: number): number {
  return Math.round((px - CELL / 2) / CELL);
}

/**
 * Lays out every lane for a level: items evenly spaced around the loop from a random offset, moving
 * faster each level. `random` returns 0..1 like Math.random.
 */
export function buildLanes(level: number, random: () => number = Math.random): Lane[] {
  const speedFactor = 1 + (level - 1) * SPEED_PER_LEVEL;
  return LANES.map((spec, row) => {
    const lane: Lane = { row, kind: spec.kind, item: spec.item, speed: (spec.speed ?? 0) * speedFactor, items: [] };
    if (spec.item && spec.length && spec.count) {
      const w = spec.length * CELL;
      const spacing = LOOP / spec.count;
      const offset = Math.floor(random() * (Math.floor(spacing) + 1));
      for (let i = 0; i < spec.count; i++) lane.items.push({ x: -WRAP_MARGIN + offset + i * spacing, w, phase: random() * 6 });
    }
    return lane;
  });
}

/** Moves every lane's items for `dt` seconds, wrapping them around the loop. */
export function moveLanes(lanes: readonly Lane[], dt: number): void {
  for (const lane of lanes) {
    for (const it of lane.items) {
      it.x += lane.speed * dt;
      // Wrap only once the whole item is off screen. It reappears fully off the other side,
      // whatever its width, instead of popping into view partway across the edge.
      if (it.x > GRID_W) it.x -= LOOP;
      else if (it.x + it.w < 0) it.x += LOOP;
    }
  }
}

/**
 * Where a hop from (px, row) in a direction lands, or null if it would leave the playfield.
 * Hops snap to the nearest column, so riding a log never leaves you between cells.
 */
export function hopTarget(px: number, row: number, dir: DirName): { px: number; row: number } | null {
  const [dx, dy] = DIRS[dir];
  const nextRow = row + dy;
  if (nextRow < 0 || nextRow > START_ROW) return null;
  const col = Math.min(COLS - 1, Math.max(0, columnAt(px) + dx));
  return { px: columnX(col), row: nextRow };
}

/** Turtle groups spend part of each cycle underwater (from level 2), where they can't be stood on. */
export function submerged(it: Item, level: number, elapsedMs: number): boolean {
  if (level < 2) return false;
  return Math.sin(elapsedMs / 900 + it.phase) > 0.75;
}

/** The log or surfaced turtle group under x, if any. `pad` trims that much off each end. */
export function itemUnder(lane: Lane, x: number, pad: number, level: number, elapsedMs: number): Item | undefined {
  return lane.items.find((it) => x > it.x + pad && x < it.x + it.w - pad && !(lane.item === 'turtle' && submerged(it, level, elapsedMs)));
}

/** What standing at px in a lane costs: hit by traffic, in the water, or nothing. */
export function hazardAt(lane: Lane, px: number, level: number, elapsedMs: number): Hazard | null {
  if (lane.kind === 'road') {
    // A few pixels of forgiveness at car bumpers.
    return lane.items.some((it) => px + CELL * 0.3 > it.x + 4 && px - CELL * 0.3 < it.x + it.w - 4) ? 'SPLAT' : null;
  }
  if (lane.kind === 'river') return itemUnder(lane, px, 2, level, elapsedMs) ? null : 'SPLASH';
  return null;
}

/** True once a ride has carried the hopper past either edge of the grid. */
export function sweptAway(px: number): boolean {
  return px < CELL * 0.25 || px > GRID_W - CELL * 0.25;
}

/** The dock a hopper at px in the top row lands in, or -1 for the solid bank between docks. */
export function dockAt(px: number): number {
  const col = columnAt(px);
  return DOCK_COLS.findIndex((d) => col >= d && col < d + DOCK_WIDTH);
}

/** The centre x of a dock. */
export function dockCentre(dock: number): number {
  return (DOCK_COLS[dock] + DOCK_WIDTH / 2) * CELL;
}

/** Points for reaching a dock: a base, a bonus per whole second left, and the orb if it was there. */
export function dockPoints(timeLeft: number, hasOrb: boolean): number {
  return POINTS_DOCK + Math.ceil(timeLeft) * POINTS_PER_SECOND_LEFT + (hasOrb ? POINTS_ORB : 0);
}

/** The indexes of the docks that are still empty. */
export function freeDocks(docks: readonly boolean[]): number[] {
  return docks.map((filled, i) => (filled ? -1 : i)).filter((i) => i >= 0);
}

/** Shortest and longest wait, in ms, before the next bonus orb in a daily challenge. */
export const ORB_WAIT_MS = { min: 3000, max: 15000 } as const;

/**
 * How long to wait for the next bonus orb in a daily challenge. A normal game rolls the dice every
 * frame, which depends on the frame rate; drawing the wait from the day's seed gives every player
 * the same schedule. The average (9 s) matches a normal game. `random` returns 0..1 like Math.random.
 */
export function orbWait(random: () => number): number {
  return ORB_WAIT_MS.min + random() * (ORB_WAIT_MS.max - ORB_WAIT_MS.min);
}
