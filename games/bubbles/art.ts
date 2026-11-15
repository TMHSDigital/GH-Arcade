import Phaser from 'phaser';
import { R } from './config';
import { NEON } from '../../shared/ui';

/**
 * Neon Bubbles' procedural textures. The bubble is drawn white with its glow baked in, so one
 * texture tinted per color serves every bubble without a filter each. Every color also has its own
 * symbol, drawn on top untinted, so colors can be told apart without seeing them.
 */

/** Bubble colors by index; the field uses the first `colorCount(level)` of them. */
export const BUBBLE_COLORS: readonly number[] = [NEON.pink, NEON.cyan, NEON.yellow, NEON.green, NEON.purple, NEON.orange];

export const BUBBLE_TEXTURE = 'bubble';
/** How far the baked glow reaches past the bubble's edge. */
const GLOW = 7;

export function symbolTexture(color: number): string {
  return `bubble-sym-${color}`;
}

/** Draws the textures once per game; any scene may call it. */
export function ensureBubbleTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(BUBBLE_TEXTURE)) return;
  const g = scene.make.graphics({}, false);

  const c = R + GLOW;
  for (let i = GLOW; i > 0; i--) g.fillStyle(0xffffff, 0.05 * (GLOW - i + 1)).fillCircle(c, c, R + i);
  g.fillStyle(0xffffff, 0.45).fillCircle(c, c, R);
  g.lineStyle(3, 0xffffff, 1).strokeCircle(c, c, R - 1.5);
  g.fillStyle(0xffffff, 0.85).fillCircle(c - R * 0.4, c - R * 0.4, R * 0.18);
  g.generateTexture(BUBBLE_TEXTURE, c * 2, c * 2);

  const s = R * 0.42;
  const m = R;
  const shapes: ((gfx: Phaser.GameObjects.Graphics) => void)[] = [
    // Ring
    (gfx) => gfx.lineStyle(3, 0xffffff, 1).strokeCircle(m, m, s * 0.85),
    // Triangle
    (gfx) => gfx.fillTriangle(m, m - s, m + s, m + s * 0.8, m - s, m + s * 0.8),
    // Square
    (gfx) => gfx.fillRect(m - s * 0.8, m - s * 0.8, s * 1.6, s * 1.6),
    // Diamond
    (gfx) => gfx.fillTriangle(m, m - s * 1.15, m + s, m, m - s, m).fillTriangle(m, m + s * 1.15, m + s, m, m - s, m),
    // Plus
    (gfx) => gfx.fillRect(m - s, m - s * 0.3, s * 2, s * 0.6).fillRect(m - s * 0.3, m - s, s * 0.6, s * 2),
    // Cross
    (gfx) =>
      gfx
        .lineStyle(s * 0.6, 0xffffff, 1)
        .lineBetween(m - s * 0.8, m - s * 0.8, m + s * 0.8, m + s * 0.8)
        .lineBetween(m - s * 0.8, m + s * 0.8, m + s * 0.8, m - s * 0.8),
  ];
  shapes.forEach((draw, i) => {
    g.clear().fillStyle(0xffffff, 1);
    draw(g);
    g.generateTexture(symbolTexture(i), R * 2, R * 2);
  });
  g.destroy();
}

/** One bubble on screen: the tinted body and its symbol, kept together. */
export class BubbleSprite {
  readonly body: Phaser.GameObjects.Image;
  readonly sym: Phaser.GameObjects.Image;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    readonly color: number,
    parent?: Phaser.GameObjects.Container,
  ) {
    this.body = scene.add.image(x, y, BUBBLE_TEXTURE).setTint(BUBBLE_COLORS[color]);
    this.sym = scene.add.image(x, y, symbolTexture(color)).setAlpha(0.9);
    parent?.add([this.body, this.sym]);
  }

  get parts(): Phaser.GameObjects.Image[] {
    return [this.body, this.sym];
  }

  get x(): number {
    return this.body.x;
  }

  get y(): number {
    return this.body.y;
  }

  setPosition(x: number, y: number): this {
    this.body.setPosition(x, y);
    this.sym.setPosition(x, y);
    return this;
  }

  setScale(scale: number): this {
    this.body.setScale(scale);
    this.sym.setScale(scale);
    return this;
  }

  setDepth(depth: number): this {
    this.body.setDepth(depth);
    this.sym.setDepth(depth);
    return this;
  }

  destroy(): void {
    this.body.destroy();
    this.sym.destroy();
  }
}
