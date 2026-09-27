import Phaser from 'phaser';
import { GAME_ID, HEIGHT, WIDTH } from '../config';
import { buildMenu } from '../../../shared/scenes';
import { drawGrid, NEON, reducedMotion } from '../../../shared/ui';

const TRAIL = 26;

export class MenuScene extends Phaser.Scene {
  private trail!: Phaser.GameObjects.Graphics;

  constructor() {
    super('Menu');
  }

  create(): void {
    drawGrid(this, WIDTH, HEIGHT, 25);
    this.trail = this.add.graphics().setAlpha(0.3);
    buildMenu(this, {
      gameId: GAME_ID,
      title: ['NEON', 'SNAKE'],
      colors: [NEON.cyan, NEON.green],
      help: 'Steer: arrows / WASD / swipe / d-pad    Pause: P / Start    Mute: M',
    });
  }

  /** A decorative snake gliding along a figure-eight behind the title. */
  update(now: number): void {
    const time = reducedMotion() ? 2600 : now;
    const g = this.trail.clear();
    for (let i = TRAIL - 1; i >= 0; i--) {
      const t = time / 1400 - i * 0.07;
      const x = WIDTH / 2 + Math.sin(t) * 300;
      const y = HEIGHT / 2 - 20 + Math.sin(t * 2) * 130;
      const color = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(NEON.green),
        Phaser.Display.Color.ValueToColor(NEON.cyan),
        TRAIL,
        i,
      );
      g.fillStyle(Phaser.Display.Color.GetColor(color.r, color.g, color.b), 1 - i / TRAIL);
      g.fillRoundedRect(x - 10, y - 10, 20, 20, 5);
    }
  }
}
