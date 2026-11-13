import Phaser from 'phaser';
import { GAME_ID, HEIGHT, WIDTH } from '../config';
import { buildMenu } from '../../../shared/scenes';
import { helpKeys } from '../../../shared/settings';
import { NEON, reducedMotion } from '../../../shared/ui';

/** Menu backdrop: the runner loops a dotted track with a chaser on its tail. */
export class MenuScene extends Phaser.Scene {
  private gfx!: Phaser.GameObjects.Graphics;

  constructor() {
    super('Menu');
  }

  create(): void {
    this.gfx = this.add.graphics().setAlpha(0.35);
    buildMenu(this, {
      gameId: GAME_ID,
      title: ['NEON', 'MAZE'],
      colors: [NEON.yellow, NEON.blue],
      help: `Steer: ${helpKeys(['left', 'right', 'up', 'down'], 'arrows / WASD')} / d-pad / stick / swipe\nClear every dot, grab a power cell to turn the tables    Pause: ${helpKeys('pause', 'P')} / Start`,
    });
  }

  update(now: number): void {
    const t = reducedMotion() ? 2 : now / 1000;
    const g = this.gfx.clear();
    const y = HEIGHT - 60;
    g.lineStyle(2, NEON.blue, 1).lineBetween(0, y - 22, WIDTH, y - 22).lineBetween(0, y + 22, WIDTH, y + 22);
    const span = WIDTH + 200;
    const runner = ((t * 160) % span) - 100;
    for (let x = 20; x < WIDTH; x += 40) if (x > runner) g.fillStyle(NEON.white, 1).fillRect(x - 3, y - 3, 6, 6);
    g.fillStyle(NEON.yellow, 1).fillCircle(runner, y, 12);
    const colors = [NEON.pink, NEON.cyan, NEON.orange];
    colors.forEach((c, i) => g.fillStyle(c, 1).fillRoundedRect(runner - 70 - i * 44 - 12, y - 12, 24, 24, 6));
  }
}
