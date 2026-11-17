import Phaser from 'phaser';
import { GAME_ID, HEIGHT, WIDTH } from '../config';
import { bestRoundText } from '../best';
import { getHighScore } from '../../../shared/achievements';
import { buildMenu, SCENE } from '../../../shared/scenes';
import { helpKeys } from '../../../shared/settings';
import { drawGrid, NEON, neonText, reducedMotion } from '../../../shared/ui';

/** Menu backdrop: a faint green with a ball banking round it toward a cup. */
export class MenuScene extends Phaser.Scene {
  private gfx!: Phaser.GameObjects.Graphics;

  constructor() {
    super(SCENE.menu);
  }

  create(): void {
    drawGrid(this, WIDTH, HEIGHT, 40, NEON.green);
    this.gfx = this.add.graphics().setAlpha(0.35);
    buildMenu(this, {
      gameId: GAME_ID,
      title: ['NEON', 'GOLF'],
      colors: [NEON.green, NEON.pink],
      help: `Aim and power: drag back from the ball and let go / ${helpKeys(['left', 'right'], 'arrows')} + hold ${helpKeys('action', 'Space')} / stick + A\n9 holes, fewest strokes wins    Pause: ${helpKeys('pause', 'P')} / Start`,
    });
    const best = bestRoundText(getHighScore(GAME_ID));
    if (best) neonText(this, WIDTH / 2, 350, `BEST ROUND ${best}`, 12, NEON.green);
  }

  update(now: number): void {
    const t = reducedMotion() ? 2.2 : now / 1000;
    const g = this.gfx.clear();
    // A box the ball bounces round, folded so it reads as a ball banking off the walls.
    const left = 60;
    const top = 60;
    const w = WIDTH - 120;
    const h = HEIGHT - 120;
    g.lineStyle(2, NEON.cyan, 1).strokeRoundedRect(left, top, w, h, 12);
    g.fillStyle(NEON.bg, 1).fillCircle(left + w - 50, top + 50, 12);
    g.lineStyle(2, NEON.white, 1).strokeCircle(left + w - 50, top + 50, 12);
    const fold = (v: number, span: number) => {
      const m = v % (2 * span);
      return m < span ? m : 2 * span - m;
    };
    for (let i = 6; i >= 0; i--) {
      const s = t - i * 0.03;
      const x = left + 10 + fold(s * 230, w - 20);
      const y = top + 10 + fold(s * 170, h - 20);
      g.fillStyle(i === 0 ? NEON.white : NEON.cyan, i === 0 ? 1 : 0.5 - i * 0.06).fillCircle(x, y, i === 0 ? 7 : 6 - i * 0.6);
    }
  }
}
