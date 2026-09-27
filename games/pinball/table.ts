/**
 * Table layout. The playfield spans x 200..560 under an arched top; the launch lane runs up the right
 * side (x 560..590) and the arch bends a launched ball back into play.
 */
export interface Point {
  x: number;
  y: number;
}

export interface Segment {
  a: Point;
  b: Point;
}

export interface Circle extends Point {
  r: number;
}

const ARCH = { x: 395, y: 215, r: 195 };

function arch(steps: number): Segment[] {
  const out: Segment[] = [];
  let prev: Point | null = null;
  for (let i = 0; i <= steps; i++) {
    const a = Math.PI + (Math.PI * i) / steps;
    const p = { x: ARCH.x + ARCH.r * Math.cos(a), y: ARCH.y + ARCH.r * Math.sin(a) };
    if (prev) out.push({ a: prev, b: p });
    prev = p;
  }
  return out;
}

const seg = (ax: number, ay: number, bx: number, by: number): Segment => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });

export const LANE_X = 575;
export const LANE_INNER = 560;
export const PLUNGER_Y = 556;

/** Plain walls: outline, launch lane divider, and the guides that feed the flippers. */
export const WALLS: Segment[] = [
  seg(200, 460, 200, ARCH.y),
  ...arch(24),
  seg(590, ARCH.y, 590, 610),
  seg(LANE_INNER, 240, LANE_INNER, 610),
  // The inlane guides end on the flippers' top surface, so a rolling ball flows onto the flipper instead of wedging at the pivot.
  seg(200, 460, 303.5, 529),
  seg(LANE_INNER, 460, 456.5, 529),
  // Slingshot backs; their kicking faces are in SLINGS.
  seg(240, 395, 240, 450),
  seg(240, 450, 285, 480),
  seg(520, 395, 520, 450),
  seg(520, 450, 475, 480),
];

/** Slingshot faces, which kick the ball back up and across. */
export const SLINGS: Segment[] = [seg(285, 480, 240, 395), seg(520, 395, 475, 480)];

export const FLIPPER_PIVOTS: Point[] = [
  { x: 300, y: 535 },
  { x: 460, y: 535 },
];

export const BUMPERS: Circle[] = [
  { x: 320, y: 205, r: 22 },
  { x: 440, y: 205, r: 22 },
  { x: 380, y: 275, r: 22 },
];

/** Small posts dividing the top lanes. */
export const POSTS: Circle[] = [
  { x: 367, y: 78, r: 5 },
  { x: 423, y: 78, r: 5 },
];

/** Rollover sensors in the top lanes; lighting all three raises the multiplier. */
export const LANES: Circle[] = [
  { x: 340, y: 84, r: 10 },
  { x: 395, y: 74, r: 10 },
  { x: 450, y: 84, r: 10 },
];

/** Drop-target bank on the left wall. */
export const TARGETS: Segment[] = [seg(207, 262, 207, 288), seg(207, 298, 207, 324), seg(207, 334, 207, 360)];

/** Standup targets on the right wall; they never drop. */
export const STANDUPS: Segment[] = [seg(553, 300, 553, 326), seg(553, 336, 553, 362)];
