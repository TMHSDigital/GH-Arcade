import Phaser from 'phaser';
import { GAME_ID, HEIGHT, WIDTH } from '../config';
import { buildMenu } from '../../../shared/scenes';
import { NEON } from '../../../shared/ui';

interface Drifter {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  angle: number;
  spin: number;
  shape: number[];
}

export class MenuScene extends Phaser.Scene {
  private rocks: Drifter[] = [];
  private gfx!: Phaser.GameObjects.Graphics;

  constructor() {
    super('Menu');
  }

  create(): void {
    const stars = this.add.graphics();
    for (let i = 0; i < 90; i++) {
      stars.fillStyle(0xffffff, Phaser.Math.FloatBetween(0.1, 0.5)).fillCircle(Phaser.Math.Between(0, WIDTH), Phaser.Math.Between(0, HEIGHT), 1);
    }
    this.gfx = this.add.graphics().setAlpha(0.35);
    this.rocks = Array.from({ length: 9 }, () => ({
      x: Phaser.Math.Between(0, WIDTH),
      y: Phaser.Math.Between(0, HEIGHT),
      vx: Phaser.Math.FloatBetween(-30, 30),
      vy: Phaser.Math.FloatBetween(-30, 30),
      r: Phaser.Math.Between(14, 50),
      angle: 0,
      spin: Phaser.Math.FloatBetween(-0.6, 0.6),
      shape: Array.from({ length: 11 }, () => Phaser.Math.FloatBetween(0.72, 1.08)),
    }));

    buildMenu(this, {
      gameId: GAME_ID,
      title: ['ASTRO', 'BLASTER'],
      colors: [NEON.orange, NEON.cyan],
      help: 'Turn: ← → / stick    Thrust: ↑    Fire: Space / Z / A    Warp: Shift / X / B\nTouch: left stick, FIRE and WARP buttons    Pause: P / Start',
    });
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;
    const g = this.gfx.clear();
    for (const r of this.rocks) {
      r.x = (r.x + r.vx * dt + WIDTH) % WIDTH;
      r.y = (r.y + r.vy * dt + HEIGHT) % HEIGHT;
      r.angle += r.spin * dt;
      g.lineStyle(2, NEON.orange, 1).beginPath();
      r.shape.forEach((m, i) => {
        const a = r.angle + (i / r.shape.length) * Math.PI * 2;
        const px = r.x + Math.cos(a) * r.r * m;
        const py = r.y + Math.sin(a) * r.r * m;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      });
      g.closePath().strokePath();
    }
  }
}
