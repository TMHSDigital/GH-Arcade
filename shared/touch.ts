import Phaser from 'phaser';
import { getSettings } from './settings';
import { NEON, PIXEL_FONT } from './ui';

export { isTouchDevice } from './device';

export { onSwipe, type SwipeDir, type SwipeOptions } from './swipe';

/**
 * Where an on-screen control goes given the player's touch settings: with the left-handed layout
 * on, x is flipped across the middle of the screen. Use it for any touch-only UI a game places itself.
 *
 * Only one-sided controls need it. Gestures that work anywhere on the screen (swipes, drags, tap to
 * jump) and halves that belong to something on that side (Pinball's flippers, each player's half in
 * a two-player game) stay where they are.
 */
export function mirrorX(scene: Phaser.Scene, x: number): number {
  return getSettings().touch.mirrored ? scene.scale.gameSize.width - x : x;
}

/** A short vibration for an on-screen button press, if the player wants it and the device can. */
function pulse(): void {
  if (!getSettings().touch.haptics) return;
  try {
    navigator.vibrate?.(10);
  } catch {
    /* vibration blocked or unsupported */
  }
}

/**
 * On-screen analog stick. It appears wherever the player first touches inside its zone
 * (so it works for any hand size), and reports x/y in -1..1. Its size follows the player's touch
 * scale, and the left-handed layout moves its zone to the other side of the screen.
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
    baseRadius = 60,
  ) {
    const { scale, mirrored } = getSettings().touch;
    const radius = baseRadius * scale;
    if (mirrored) zone = new Phaser.Geom.Rectangle(scene.scale.gameSize.width - zone.right, zone.y, zone.width, zone.height);
    // Rests in the outer bottom corner of its zone, whichever side that is.
    const home = { x: mirrored ? zone.right - radius - 30 : zone.x + radius + 30, y: zone.bottom - radius - 30 };
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

/**
 * Round on-screen button. Tracks its own pointer so it works alongside a stick (multi-touch).
 * Its size and side follow the player's touch settings, and a press gives a short vibration.
 */
export class VirtualButton {
  private pointers = new Set<number>();
  private readonly circle: Phaser.GameObjects.Arc;

  constructor(scene: Phaser.Scene, baseX: number, y: number, label: string, color: number = NEON.pink, baseRadius = 42) {
    const x = mirrorX(scene, baseX);
    const radius = baseRadius * getSettings().touch.scale;
    this.circle = scene.add.circle(x, y, radius, color, 0.12).setStrokeStyle(2, color, 0.7).setDepth(900);
    scene.add
      .text(x, y, label, { fontFamily: PIXEL_FONT, fontSize: '12px', color: '#e8e8ff' })
      .setOrigin(0.5)
      .setDepth(901);
    const hit = new Phaser.Geom.Circle(x, y, radius * 1.3);
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (hit.contains(p.x, p.y)) {
        if (this.pointers.size === 0) pulse();
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
