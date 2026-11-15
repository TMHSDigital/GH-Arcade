import Phaser from 'phaser';
import { GAME_ID, HEIGHT, MAX_COLORS, WIDTH } from '../config';
import { BubbleSprite, ensureBubbleTextures } from '../art';
import { DAILY_MODES } from '../../../shared/rng';
import { buildMenu, SCENE } from '../../../shared/scenes';
import { helpKeys } from '../../../shared/settings';
import { drawGrid, NEON, reducedMotion } from '../../../shared/ui';

/** Menu backdrop: dim bubbles drifting up past the title. */
export class MenuScene extends Phaser.Scene {
  constructor() {
    super(SCENE.menu);
  }

  create(): void {
    ensureBubbleTextures(this);
    drawGrid(this, WIDTH, HEIGHT);
    for (let i = 0; i < 16; i++) {
      const bubble = new BubbleSprite(this, Phaser.Math.Between(20, WIDTH - 20), Phaser.Math.Between(0, HEIGHT), i % MAX_COLORS);
      const scale = Phaser.Math.FloatBetween(0.6, 1.3);
      bubble.setScale(scale);
      for (const part of bubble.parts) part.setAlpha(0.18);
      if (reducedMotion()) continue;
      this.tweens.add({
        targets: bubble.parts,
        y: -40,
        duration: Phaser.Math.Between(9000, 18000) * (1 - bubble.y / HEIGHT / 2),
        onComplete: () => {
          // Then loop from below the screen at a steady pace.
          bubble.setPosition(Phaser.Math.Between(20, WIDTH - 20), HEIGHT + 40);
          this.tweens.add({
            targets: bubble.parts,
            y: -40,
            duration: Phaser.Math.Between(10000, 18000),
            repeat: -1,
            onRepeat: () => bubble.setPosition(Phaser.Math.Between(20, WIDTH - 20), HEIGHT + 40),
          });
        },
      });
    }

    buildMenu(this, {
      gameId: GAME_ID,
      title: ['NEON', 'BUBBLES'],
      colors: [NEON.cyan, NEON.pink],
      help: `Aim: mouse / drag / ${helpKeys(['left', 'right'], '← →')} / stick    Fire: click / release / ${helpKeys('action', 'space')} / A\nSwap: ${helpKeys('alt', 'Shift / X')} / tap NEXT / B    Pop 3 of a color, drop what hangs    Pause: ${helpKeys('pause', 'P')} / Start`,
      // Daily: the same fields, new rows and loaded colors for everyone on a given (UTC) date, with its own best score.
      modes: DAILY_MODES,
    });
  }
}
