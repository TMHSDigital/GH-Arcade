import Phaser from 'phaser';
import { GAME_ID, HEIGHT, WIDTH } from '../config';
import { buildMenu } from '../../../shared/scenes';
import { NEON, reducedMotion } from '../../../shared/ui';

/** Menu backdrop: dim lanes with cars and logs gliding past. */
export class MenuScene extends Phaser.Scene {
  private gfx!: Phaser.GameObjects.Graphics;

  constructor() {
    super('Menu');
  }

  create(): void {
    this.gfx = this.add.graphics().setAlpha(0.3);
    buildMenu(this, {
      gameId: GAME_ID,
      title: ['NEON', 'HOP'],
      colors: [NEON.blue, NEON.green],
      help: 'Hop: arrows / WASD / d-pad / swipe (tap hops forward)\nCross the road, ride the logs and turtles, fill all five docks    Pause: P / Start',
    });
  }

  update(now: number): void {
    const t = reducedMotion() ? 0 : now / 1000;
    const g = this.gfx.clear();
    const lanes = [
      { y: 80, speed: 60, color: NEON.purple, w: 180 },
      { y: 128, speed: -80, color: NEON.green, w: 90 },
      { y: 440, speed: 120, color: NEON.pink, w: 50 },
      { y: 488, speed: -70, color: NEON.orange, w: 100 },
      { y: 536, speed: 90, color: NEON.yellow, w: 50 },
    ];
    for (const lane of lanes) {
      for (let i = 0; i < 4; i++) {
        const x = ((i * 260 + lane.speed * t) % (WIDTH + 260) + WIDTH + 260) % (WIDTH + 260) - 200;
        g.lineStyle(2, lane.color, 1).strokeRoundedRect(x, lane.y, lane.w, 30, 8);
      }
    }
    g.lineStyle(1, NEON.white, 0.2).lineBetween(0, HEIGHT - 20, WIDTH, HEIGHT - 20);
  }
}
