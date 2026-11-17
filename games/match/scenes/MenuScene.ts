import Phaser from 'phaser';
import { drawGem } from '../art';
import { loadBests } from '../best';
import { GAME_ID, GEM_TINTS, HEIGHT, MOVES, TIMED_SECONDS, WIDTH } from '../config';
import { DAILY_MODE_LABEL } from '../../../shared/rng';
import { buildMenu, SCENE } from '../../../shared/scenes';
import { helpKeys } from '../../../shared/settings';
import { drawGrid, HUD_LABEL_STYLE, hex, NEON, reducedMotion } from '../../../shared/ui';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super(SCENE.menu);
  }

  create(): void {
    drawGrid(this, WIDTH, HEIGHT, 64);
    // Gems drifting down and turning slowly behind the title.
    for (let i = 0; i < 14; i++) {
      const g = this.add.graphics().setAlpha(0.2);
      drawGem(g, i % GEM_TINTS.length, i % 5 === 4 ? 'bomb' : 'none', 64);
      g.setPosition(50 + ((i * 113) % (WIDTH - 100)), -80 - i * 70);
      if (reducedMotion()) {
        g.setY(40 + ((i * 151) % (HEIGHT - 80)));
        continue;
      }
      this.tweens.add({
        targets: g,
        y: HEIGHT + 80,
        angle: (i % 2 ? 1 : -1) * 90,
        duration: 8000 + (i % 5) * 1400,
        delay: i * 550,
        repeat: -1,
      });
    }

    buildMenu(this, {
      gameId: GAME_ID,
      title: ['NEON', 'MATCH'],
      colors: [NEON.pink, NEON.cyan],
      help:
        `Swap: drag a gem or tap two    ${helpKeys(['left', 'right', 'up', 'down'], 'Arrows')} / d-pad, ` +
        `${helpKeys('action', 'Space')} / A to pick, then a direction\n` +
        `Match 4 for a line blast, 5 or an L for a bomb    Pause: ${helpKeys('pause', 'P')} / Start`,
      // Daily: a Moves game on the same boards for everyone on a given (UTC) date, with its own best score.
      modes: [
        { label: 'TIMED', data: { mode: 'timed' } },
        { label: 'MOVES', data: { mode: 'moves' } },
        { label: DAILY_MODE_LABEL, data: { mode: 'moves', daily: true } },
      ],
    });

    // Each mode keeps its own best, shown under its option (buildMenu spaces three options 230 apart).
    const bests = loadBests();
    const notes: [number, string, number][] = [
      [WIDTH / 2 - 230, `${TIMED_SECONDS} SECONDS`, bests.timed],
      [WIDTH / 2, `${MOVES} MOVES`, bests.moves],
      [WIDTH / 2 + 230, `${MOVES} MOVES, SAME BOARD`, 0],
    ];
    for (const [x, what, best] of notes) {
      this.add.text(x, 440, what, HUD_LABEL_STYLE).setOrigin(0.5);
      if (best > 0) this.add.text(x, 458, `BEST ${best.toLocaleString()}`, { ...HUD_LABEL_STYLE, color: hex(NEON.yellow) }).setOrigin(0.5);
    }
  }
}
