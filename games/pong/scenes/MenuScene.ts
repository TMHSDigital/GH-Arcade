import Phaser from 'phaser';
import { GAME_ID, HEIGHT, WIDTH } from '../config';
import { buildMenu } from '../../../shared/scenes';
import { NEON, reducedMotion } from '../../../shared/ui';

/** Menu backdrop: two ghost paddles rallying a ball behind the title. */
export class MenuScene extends Phaser.Scene {
  private gfx!: Phaser.GameObjects.Graphics;

  constructor() {
    super('Menu');
  }

  create(): void {
    this.gfx = this.add.graphics().setAlpha(0.25);
    buildMenu(this, {
      gameId: GAME_ID,
      title: ['NEON', 'PONG'],
      colors: [NEON.cyan, NEON.pink],
      help: 'Solo: ↑ ↓ / W S / stick / drag vs the CPU    Two players: P1 W S or pad 1, P2 ↑ ↓ or pad 2\nFirst to 7 wins    Pause: P / Start',
      modes: [
        { label: 'VS CPU', data: { players: 1 } },
        { label: '2 PLAYERS', data: { players: 2 } },
      ],
    });
  }

  update(now: number): void {
    const t = reducedMotion() ? 0.3 : now / 1000;
    const g = this.gfx.clear();
    // A ball bouncing between the paddles on a triangle wave, with the paddles tracking it.
    const phase = (t * 0.45) % 2;
    const x = 60 + (phase < 1 ? phase : 2 - phase) * (WIDTH - 120);
    const yPhase = (t * 0.7) % 2;
    const y = 120 + (yPhase < 1 ? yPhase : 2 - yPhase) * (HEIGHT - 240);
    g.fillStyle(NEON.cyan, 1).fillRoundedRect(30, y - 45, 14, 90, 6);
    g.fillStyle(NEON.pink, 1).fillRoundedRect(WIDTH - 44, y - 45, 14, 90, 6);
    g.fillStyle(NEON.white, 1).fillRect(x - 6, y - 6, 12, 12);
  }
}
