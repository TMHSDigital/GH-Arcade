import Phaser from 'phaser';
import { GAME_ID, GROUND_Y, HEIGHT, WIDTH } from '../config';
import { buildMenu } from '../../../shared/scenes';
import { NEON } from '../../../shared/ui';

export class MenuScene extends Phaser.Scene {
  private floor!: Phaser.GameObjects.Graphics;

  constructor() {
    super('Menu');
  }

  create(): void {
    this.floor = this.add.graphics().setAlpha(0.5);
    buildMenu(this, {
      gameId: GAME_ID,
      title: ['NEON', 'RUNNER'],
      colors: [NEON.pink, NEON.cyan],
      help: 'Jump: tap / Space / ↑ / A (again in the air to double jump)    Slide: swipe down / ↓ / B\nPress down in the air to dive    Pause: P / Start',
    });
  }

  /** A perspective floor grid rushing toward the viewer. */
  update(time: number): void {
    const g = this.floor.clear();
    g.lineStyle(1, NEON.pink, 0.6);
    const horizon = GROUND_Y - 40;
    for (let i = 0; i < 10; i++) {
      const t = ((time / 900 + i / 10) % 1) ** 2;
      const y = horizon + t * (HEIGHT - horizon);
      g.lineBetween(0, y, WIDTH, y);
    }
    for (let x = -12; x <= 12; x++) {
      g.lineBetween(WIDTH / 2 + x * 20, horizon, WIDTH / 2 + x * 140, HEIGHT);
    }
  }
}
