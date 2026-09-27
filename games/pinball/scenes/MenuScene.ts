import Phaser from 'phaser';
import { GAME_ID } from '../config';
import { buildMenu } from '../../../shared/scenes';
import { NEON, reducedMotion } from '../../../shared/ui';

/** Menu backdrop: a pair of flippers idly batting and three pulsing bumpers. */
export class MenuScene extends Phaser.Scene {
  private gfx!: Phaser.GameObjects.Graphics;

  constructor() {
    super('Menu');
  }

  create(): void {
    this.gfx = this.add.graphics().setAlpha(0.3);
    buildMenu(this, {
      gameId: GAME_ID,
      title: ['NEON', 'PINBALL'],
      colors: [NEON.pink, NEON.cyan],
      help: 'Flippers: left / right, A D, Z M, LB RB, or hold each side of the screen\nLaunch: hold Space / Down / A and release    Pause: P / Start',
    });
  }

  update(now: number): void {
    const t = reducedMotion() ? 0 : now / 1000;
    const g = this.gfx.clear();
    [
      { x: 110, y: 150 },
      { x: 690, y: 150 },
      { x: 110, y: 330 },
      { x: 690, y: 330 },
    ].forEach((b, i) => {
      const pulse = 0.5 + 0.5 * Math.abs(Math.sin(t * 2 + i));
      g.fillStyle(NEON.cyan, 0.3 * pulse).fillCircle(b.x, b.y, 34);
      g.lineStyle(3, NEON.cyan, 1).strokeCircle(b.x, b.y, 24);
    });
    const swing = (Math.sin(t * 3) > 0.7 ? -0.5 : 0.5) as number;
    g.lineStyle(14, NEON.yellow, 1);
    g.lineBetween(90, 530, 90 + Math.cos(swing) * 70, 530 + Math.sin(swing) * 70);
    g.lineBetween(710, 530, 710 - Math.cos(swing) * 70, 530 + Math.sin(swing) * 70);
  }
}
