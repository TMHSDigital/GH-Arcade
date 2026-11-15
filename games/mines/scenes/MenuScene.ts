import Phaser from 'phaser';
import { DIFFICULTIES, DIFFICULTY_ORDER, GAME_ID, HEIGHT, WIDTH } from '../config';
import { formatTime, loadBestTimes } from '../scoring';
import { DAILY_MODE_LABEL } from '../../../shared/rng';
import { buildMenu, SCENE } from '../../../shared/scenes';
import { helpKeys } from '../../../shared/settings';
import { hex, NEON, PIXEL_FONT, reducedMotion } from '../../../shared/ui';

const TILE = 40;
const NUMBER_COLORS = [NEON.cyan, NEON.green, NEON.pink, NEON.purple];

export class MenuScene extends Phaser.Scene {
  constructor() {
    super(SCENE.menu);
  }

  create(): void {
    this.drawField();

    buildMenu(this, {
      gameId: GAME_ID,
      title: ['NEON', 'MINES'],
      colors: [NEON.green, NEON.pink],
      help: `Mouse: left reveal, right flag    Touch: tap reveal, hold or FLAG mode to flag\n${helpKeys(['left', 'right', 'up', 'down'], 'Arrows')} move    ${helpKeys('action', 'Space')} reveal    ${helpKeys('alt', 'X')} / F flag    Pad: A / B    Pause: ${helpKeys('pause', 'P')} / Start`,
      // The daily board is the same for everyone on a given (UTC) date; "?mode=daily" opens on it.
      modes: [
        ...DIFFICULTY_ORDER.map((id) => ({ label: DIFFICULTIES[id].label, data: { difficulty: id } })),
        { label: DAILY_MODE_LABEL, data: { daily: true } },
      ],
    });

    const times = loadBestTimes();
    const line = DIFFICULTY_ORDER.filter((id) => times[id] !== undefined)
      .map((id) => `${DIFFICULTIES[id].label} ${formatTime(times[id]!)}`)
      .join('    ');
    if (line) {
      this.add
        .text(WIDTH / 2, 352, `BEST TIMES   ${line}`, { fontFamily: PIXEL_FONT, fontSize: '10px', color: '#8a8ab8' })
        .setOrigin(0.5);
    }
  }

  /** A faint minefield behind the title: hidden tiles, a few glowing numbers and flags that pulse. */
  private drawField(): void {
    const g = this.add.graphics().setDepth(-10);
    const cols = Math.ceil(WIDTH / TILE);
    const rows = Math.ceil(HEIGHT / TILE);
    const glows: Phaser.GameObjects.Text[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * TILE;
        const y = r * TILE;
        g.fillStyle(0x0d0d22, 1).fillRoundedRect(x + 2, y + 2, TILE - 4, TILE - 4, 5);
        g.lineStyle(1, NEON.purple, 0.18).strokeRoundedRect(x + 2, y + 2, TILE - 4, TILE - 4, 5);
        // A fixed pattern, so the backdrop looks the same every visit.
        const roll = (c * 7919 + r * 104729) % 23;
        if (roll === 0 || roll === 11) {
          const n = (c + r) % NUMBER_COLORS.length;
          const t = this.add
            .text(x + TILE / 2, y + TILE / 2, String(n + 1), { fontFamily: PIXEL_FONT, fontSize: '14px', color: hex(NUMBER_COLORS[n]) })
            .setOrigin(0.5)
            .setAlpha(0.25)
            .setDepth(-9);
          glows.push(t);
        } else if (roll === 5) {
          g.fillStyle(NEON.pink, 0.3).fillTriangle(x + 15, y + 11, x + 15, y + 23, x + 27, y + 17);
          g.lineStyle(2, NEON.pink, 0.3).lineBetween(x + 15, y + 11, x + 15, y + 30);
        }
      }
    }
    if (reducedMotion()) return;
    glows.forEach((t, i) => {
      this.tweens.add({ targets: t, alpha: 0.6, duration: 1400, delay: (i * 370) % 2400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    });
  }
}
