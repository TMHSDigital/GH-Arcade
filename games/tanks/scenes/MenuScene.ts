import Phaser from 'phaser';
import { GAME_ID, HEIGHT, STREAK_KEY, WIDTH } from '../config';
import { fillGround, type Point, strokeLine } from '../draw';
import { readStreak } from '../match';
import { buildMenu, SCENE } from '../../../shared/scenes';
import { helpKeys } from '../../../shared/settings';
import { loadJSON } from '../../../shared/storage';
import { drawGrid, NEON, neonText, reducedMotion } from '../../../shared/ui';

/** Menu backdrop: a ghostly ridge with a tank on each side lobbing a shell over it. */
export class MenuScene extends Phaser.Scene {
  private shellGfx!: Phaser.GameObjects.Graphics;

  constructor() {
    super(SCENE.menu);
  }

  create(): void {
    drawGrid(this, WIDTH, HEIGHT);
    const g = this.add.graphics().setAlpha(0.25);
    const ridge: Point[] = [];
    for (let x = 0; x <= WIDTH; x += 8) ridge.push({ x, y: this.groundY(x) });
    g.fillStyle(NEON.green, 0.3);
    fillGround(g, ridge, HEIGHT);
    g.lineStyle(3, NEON.green, 1);
    strokeLine(g, ridge);
    for (const [x, color, dir] of [
      [90, NEON.cyan, 1],
      [WIDTH - 90, NEON.pink, -1],
    ] as const) {
      const y = this.groundY(x);
      g.fillStyle(color, 1).fillRoundedRect(x - 15, y - 12, 30, 12, 4).fillCircle(x, y - 12, 8);
      g.lineStyle(4, color, 1).lineBetween(x, y - 12, x + dir * 16, y - 28);
    }
    this.shellGfx = this.add.graphics().setAlpha(0.35);

    buildMenu(this, {
      gameId: GAME_ID,
      title: ['NEON', 'TANKS'],
      colors: [NEON.green, NEON.pink],
      help: `Aim ${helpKeys(['left', 'right'], '← → / A D')}   Power ${helpKeys(['up', 'down'], '↑ ↓ / W S')}   Fine ${helpKeys('alt', 'Shift')} / B   Fire ${helpKeys('action', 'Space')}   or drag from your tank\nBest of 3 rounds   2 players take turns on one device   Pause: ${helpKeys('pause', 'P')} / Start`,
      modes: [
        { label: 'VS CPU', data: { players: 1 } },
        { label: 'EASY CPU', data: { players: 1, cpu: 'easy' } },
        { label: 'HARD CPU', data: { players: 1, cpu: 'hard' } },
        { label: '2 PLAYERS', data: { players: 2 } },
      ],
    });

    const streak = readStreak(loadJSON<unknown>(STREAK_KEY, null));
    if (streak.current > 0 || streak.best > 0) {
      neonText(this, WIDTH / 2, 352, `WIN STREAK ${streak.current}   BEST ${streak.best}`, 11, NEON.green);
    }
  }

  private groundY(x: number): number {
    const d = (x - WIDTH / 2) / 150;
    return HEIGHT - 70 - 90 * Math.exp(-d * d) + Math.sin(x / 60) * 6;
  }

  update(now: number): void {
    const g = this.shellGfx.clear();
    if (reducedMotion()) return;
    // A shell arcing from the left tank to the right one and back.
    const phase = (now / 2400) % 2;
    const f = phase < 1 ? phase : 2 - phase;
    const x = 106 + f * (WIDTH - 212);
    const y = HEIGHT - 110 - Math.sin(f * Math.PI) * 300;
    g.fillStyle(NEON.yellow, 0.4).fillCircle(x, y, 8);
    g.fillStyle(NEON.white, 1).fillCircle(x, y, 3);
  }
}
