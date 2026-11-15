import Phaser from 'phaser';
import { GAME_ID, HEIGHT, WIDTH } from '../config';
import { LEVELS } from '../levels';
import { loadProgress, solvedCount } from '../progress';
import { buildMenu, SCENE } from '../../../shared/scenes';
import { helpKeys } from '../../../shared/settings';
import { drawGrid, NEON, neonText, reducedMotion } from '../../../shared/ui';
import { SELECT_SCENE } from './SelectScene';

/** Menu backdrop: a robot nudges a crate along a track onto a glowing target, over and over. */
export class MenuScene extends Phaser.Scene {
  private gfx!: Phaser.GameObjects.Graphics;

  constructor() {
    super(SCENE.menu);
  }

  create(): void {
    drawGrid(this, WIDTH, HEIGHT);
    this.gfx = this.add.graphics().setAlpha(0.4);
    buildMenu(this, {
      gameId: GAME_ID,
      title: ['NEON', 'CRATES'],
      colors: [NEON.orange, NEON.green],
      startScene: SELECT_SCENE,
      help: `Move: ${helpKeys(['left', 'right', 'up', 'down'], 'arrows / WASD')} / d-pad / swipe    Undo: Z    Restart: R\nPush every crate onto a target, one at a time. No pulling    Pause: ${helpKeys('pause', 'P')} / Start`,
    });
    const solved = solvedCount(loadProgress());
    if (solved > 0) neonText(this, WIDTH / 2, 350, `SOLVED ${solved} / ${LEVELS.length}`, 12, NEON.green);
  }

  update(now: number): void {
    const g = this.gfx.clear();
    const y = HEIGHT - 120;
    const size = 26;
    const left = 120;
    const span = WIDTH - 2 * left;
    // The crate travels from the left to the target on the right, then the loop starts again.
    const t = reducedMotion() ? 0.7 : ((now / 1000) % 5) / 5;
    const crateX = left + size + Math.min(t / 0.8, 1) * (span - 2 * size);
    const home = t >= 0.8;
    g.lineStyle(2, NEON.blue, 0.6).lineBetween(left - 20, y - 22, WIDTH - left + 20, y - 22).lineBetween(left - 20, y + 22, WIDTH - left + 20, y + 22);
    g.lineStyle(2, NEON.pink, 1).strokeRect(WIDTH - left - size - size / 2, y - size / 2, size, size);
    g.fillStyle(home ? NEON.green : NEON.orange, 1).fillRoundedRect(crateX - size / 2, y - size / 2, size, size, 4);
    g.fillStyle(NEON.cyan, 1).fillCircle(crateX - size - 2, y, 11);
  }
}
