import Phaser from 'phaser';
import { NEON, PIXEL_FONT } from './ui';

export type SwipeDir = 'left' | 'right' | 'up' | 'down' | 'tap';

export function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
}

export interface SwipeOptions {
  /** Minimum travel in game pixels before a drag counts as a swipe. */
  threshold?: number;
  /**
   * Fire repeatedly during one long drag (each time it travels another `threshold`),
   * e.g. for steering a snake or sliding a block several columns. Taps still fire on release.
   */
  continuous?: boolean;
}

/** Calls `handler` with the swipe direction, or 'tap' for a short press without movement. */
export function onSwipe(scene: Phaser.Scene, handler: (dir: SwipeDir) => void, opts: SwipeOptions = {}): void {
  const threshold = opts.threshold ?? 30;
  let startX = 0;
  let startY = 0;
  let active = false;
  let swiped = false;

  scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
    startX = p.x;
    startY = p.y;
    active = true;
    swiped = false;
  });
  scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
    if (!active || !p.isDown || !opts.continuous) return;
    const dir = direction(p.x - startX, p.y - startY, threshold);
    if (dir) {
      handler(dir);
      swiped = true;
      startX = p.x;
      startY = p.y;
    }
  });
  const release = (p: Phaser.Input.Pointer) => {
    if (!active) return;
    active = false;
    const dir = direction(p.x - startX, p.y - startY, threshold);
    if (dir) handler(dir);
    else if (!swiped) handler('tap');
  };
  // A finger that slides off the canvas edge still completes its swipe.
  scene.input.on('pointerup', release);
  scene.input.on('pointerupoutside', release);
}

function direction(dx: number, dy: number, threshold: number): SwipeDir | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return null;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

/**
 * On-screen analog stick. It appears wherever the player first touches inside its zone
 * (so it works for any hand size), and reports x/y in -1..1.
 */
export class VirtualStick {
  x = 0;
  y = 0;
  private pointerId: number | null = null;
  private readonly base: Phaser.GameObjects.Arc;
  private readonly knob: Phaser.GameObjects.Arc;

  constructor(
    scene: Phaser.Scene,
    zone: Phaser.Geom.Rectangle,
    radius = 60,
  ) {
    const home = { x: zone.x + radius + 30, y: zone.bottom - radius - 30 };
    this.base = scene.add.circle(home.x, home.y, radius, NEON.cyan, 0.08).setStrokeStyle(2, NEON.cyan, 0.5).setDepth(900);
    this.knob = scene.add.circle(home.x, home.y, radius * 0.45, NEON.cyan, 0.35).setDepth(901);

    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.pointerId !== null || !zone.contains(p.x, p.y)) return;
      this.pointerId = p.id;
      this.base.setPosition(p.x, p.y);
      this.knob.setPosition(p.x, p.y);
    });
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.id !== this.pointerId) return;
      const dx = p.x - this.base.x;
      const dy = p.y - this.base.y;
      const len = Math.min(Math.hypot(dx, dy), radius);
      const angle = Math.atan2(dy, dx);
      this.knob.setPosition(this.base.x + Math.cos(angle) * len, this.base.y + Math.sin(angle) * len);
      this.x = (Math.cos(angle) * len) / radius;
      this.y = (Math.sin(angle) * len) / radius;
    });
    const release = (p: Phaser.Input.Pointer) => {
      if (p.id !== this.pointerId) return;
      this.pointerId = null;
      this.x = 0;
      this.y = 0;
      this.base.setPosition(home.x, home.y);
      this.knob.setPosition(home.x, home.y);
    };
    scene.input.on('pointerup', release);
    scene.input.on('pointerupoutside', release);
  }

  get value(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }
}

/** Round on-screen button. Tracks its own pointer so it works alongside a stick (multi-touch). */
export class VirtualButton {
  private pointers = new Set<number>();
  private readonly circle: Phaser.GameObjects.Arc;

  constructor(scene: Phaser.Scene, x: number, y: number, label: string, color: number = NEON.pink, radius = 42) {
    this.circle = scene.add.circle(x, y, radius, color, 0.12).setStrokeStyle(2, color, 0.7).setDepth(900);
    scene.add
      .text(x, y, label, { fontFamily: PIXEL_FONT, fontSize: '12px', color: '#e8e8ff' })
      .setOrigin(0.5)
      .setDepth(901);
    const hit = new Phaser.Geom.Circle(x, y, radius * 1.3);
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (hit.contains(p.x, p.y)) {
        this.pointers.add(p.id);
        this.circle.setFillStyle(color, 0.35);
      }
    });
    const release = (p: Phaser.Input.Pointer) => {
      if (this.pointers.delete(p.id) && this.pointers.size === 0) this.circle.setFillStyle(color, 0.12);
    };
    scene.input.on('pointerup', release);
    scene.input.on('pointerupoutside', release);
  }

  get isDown(): boolean {
    return this.pointers.size > 0;
  }

  /** True if a touch at (x, y) would land on this button (so other handlers can ignore it). */
  contains(x: number, y: number): boolean {
    return Phaser.Geom.Circle.Contains(new Phaser.Geom.Circle(this.circle.x, this.circle.y, this.circle.radius * 1.3), x, y);
  }
}
