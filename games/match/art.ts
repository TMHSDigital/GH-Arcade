import Phaser from 'phaser';
import { GEM_TINTS } from './config';
import type { Special } from './rules';

/** Points of a regular polygon (or a star, with an inner radius) around the origin. */
function polygon(sides: number, radius: number, rotation: number, inner?: number, dy = 0): Phaser.Math.Vector2[] {
  const count = inner === undefined ? sides : sides * 2;
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < count; i++) {
    const r = inner !== undefined && i % 2 === 1 ? inner : radius;
    const a = rotation + (i / count) * Math.PI * 2;
    pts.push(new Phaser.Math.Vector2(Math.cos(a) * r, Math.sin(a) * r + dy));
  }
  return pts;
}

const UP = -Math.PI / 2;

/**
 * Each color has its own shape, so gems stay apart for players who cannot tell the colors apart:
 * circle, diamond, star, triangle, hexagon and square.
 */
function shapeFill(g: Phaser.GameObjects.Graphics, color: number, r: number): void {
  switch (color) {
    case 0:
      g.fillCircle(0, 0, r * 0.9);
      break;
    case 1:
      g.fillPoints(polygon(4, r, UP), true);
      break;
    case 2:
      g.fillPoints(polygon(5, r, UP, r * 0.45), true);
      break;
    case 3:
      // Nudged down so the triangle sits visually centered in its cell.
      g.fillPoints(polygon(3, r * 1.05, UP, undefined, r * 0.15), true);
      break;
    case 4:
      g.fillPoints(polygon(6, r * 0.92, 0), true);
      break;
    default:
      g.fillRoundedRect(-r * 0.75, -r * 0.75, r * 1.5, r * 1.5, r * 0.22);
  }
}

/**
 * Half the side of a gem texture. The widest parts (the bomb's spikes and the triangle's halo) reach
 * about 0.55 of a cell from the center, plus half a line width.
 */
function gemHalf(size: number): number {
  return Math.ceil(size * 0.62);
}

/**
 * Returns the texture key for one gem look, drawing it the first time it is asked for. Gems are
 * Images of these textures rather than Graphics: Phaser rebuilds and triangulates a Graphics'
 * shapes on every frame, while a texture is drawn once.
 */
export function gemTexture(scene: Phaser.Scene, color: number, special: Special, size: number): string {
  const key = `match-gem-${color}-${special}-${size}`;
  if (scene.textures.exists(key)) return key;
  const half = gemHalf(size);
  const g = scene.make.graphics({}, false);
  g.translateCanvas(half, half);
  drawGem(g, color, special, size);
  g.generateTexture(key, half * 2, half * 2);
  g.destroy();
  return key;
}

/** Draws a gem centered on the current origin of `g`. `size` is the cell size. */
export function drawGem(g: Phaser.GameObjects.Graphics, color: number, special: Special, size: number): void {
  const tint = GEM_TINTS[color] ?? 0xffffff;
  const r = size * 0.36;
  // Soft halo, then the body, then a bright core: reads as a glow without a filter.
  g.fillStyle(tint, 0.14);
  shapeFill(g, color, r * 1.28);
  g.fillStyle(tint, 0.88);
  shapeFill(g, color, r);
  g.fillStyle(0xffffff, 0.3);
  shapeFill(g, color, r * 0.45);
  g.lineStyle(2, 0xffffff, 0.55);
  if (color === 0) g.strokeCircle(0, 0, r * 0.9);

  if (special === 'lineH' || special === 'lineV') {
    const long = size * 0.42;
    const thick = size * 0.09;
    const [w, h] = special === 'lineH' ? [long * 2, thick] : [thick, long * 2];
    g.fillStyle(0xffffff, 0.95).fillRect(-w / 2, -h / 2, w, h);
    // Arrow tips at both ends show which way the blast goes.
    const tip = size * 0.13;
    for (const s of [-1, 1]) {
      if (special === 'lineH') g.fillTriangle(s * (long + tip * 0.6), 0, s * (long - tip * 0.6), -tip, s * (long - tip * 0.6), tip);
      else g.fillTriangle(0, s * (long + tip * 0.6), -tip, s * (long - tip * 0.6), tip, s * (long - tip * 0.6));
    }
  } else if (special === 'bomb') {
    g.lineStyle(3, 0xffffff, 0.95).strokeCircle(0, 0, r * 1.15);
    g.fillStyle(0x05050d, 0.85).fillCircle(0, 0, r * 0.38);
    g.fillStyle(0xffffff, 1).fillCircle(0, 0, r * 0.18);
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      g.lineBetween(Math.cos(a) * r * 1.2, Math.sin(a) * r * 1.2, Math.cos(a) * r * 1.5, Math.sin(a) * r * 1.5);
    }
  }
}
