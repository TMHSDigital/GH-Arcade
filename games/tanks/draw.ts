import type Phaser from 'phaser';

export interface Point {
  x: number;
  y: number;
}

/** Fills the ground under a surface line, down to the bottom of the screen. */
export function fillGround(g: Phaser.GameObjects.Graphics, surface: readonly Point[], bottom: number): void {
  if (surface.length === 0) return;
  g.beginPath();
  g.moveTo(surface[0].x, bottom);
  for (const p of surface) g.lineTo(p.x, p.y);
  g.lineTo(surface[surface.length - 1].x, bottom);
  g.closePath();
  g.fillPath();
}

/** Strokes an open line through the points, `dy` pixels lower (clamped to `maxY`). */
export function strokeLine(g: Phaser.GameObjects.Graphics, points: readonly Point[], dy = 0, maxY = Infinity): void {
  if (points.length === 0) return;
  g.beginPath();
  g.moveTo(points[0].x, Math.min(maxY, points[0].y + dy));
  for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, Math.min(maxY, points[i].y + dy));
  g.strokePath();
}
