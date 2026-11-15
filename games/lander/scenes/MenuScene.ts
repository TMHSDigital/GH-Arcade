import Phaser from 'phaser';
import { GAME_ID, HEIGHT, WIDTH } from '../config';
import { buildStage } from '../rules';
import { DAILY_MODES } from '../../../shared/rng';
import { buildMenu, SCENE } from '../../../shared/scenes';
import { helpKeys } from '../../../shared/settings';
import { NEON, reducedMotion } from '../../../shared/ui';

/** Menu backdrop: stars over a dim ridge line, with the pad lights blinking. */
export class MenuScene extends Phaser.Scene {
  private padLights!: Phaser.GameObjects.Graphics;
  private lit: boolean | null = null;
  private padX = 0;
  private padY = 0;
  private padW = 0;

  constructor() {
    super(SCENE.menu);
  }

  create(): void {
    const stars = this.add.graphics();
    for (let i = 0; i < 80; i++) {
      stars.fillStyle(0xffffff, Phaser.Math.FloatBetween(0.1, 0.5)).fillCircle(Phaser.Math.Between(0, WIDTH), Phaser.Math.Between(0, HEIGHT * 0.6), 1);
    }
    const stage = buildStage(2);
    const g = this.add.graphics().setAlpha(0.35);
    g.fillStyle(NEON.purple, 0.15).beginPath().moveTo(0, HEIGHT);
    for (const p of stage.ground) g.lineTo(p.x, p.y);
    g.lineTo(WIDTH, HEIGHT).closePath().fillPath();
    g.lineStyle(2, NEON.purple, 1).beginPath().moveTo(stage.ground[0].x, stage.ground[0].y);
    for (const p of stage.ground) g.lineTo(p.x, p.y);
    g.strokePath();
    g.lineStyle(3, NEON.green, 1).lineBetween(stage.pad.x1, stage.pad.y, stage.pad.x2, stage.pad.y);
    this.padX = stage.pad.x1;
    this.padY = stage.pad.y;
    this.padW = stage.pad.x2 - stage.pad.x1;
    this.padLights = this.add.graphics().setAlpha(0.6);
    this.lit = null;

    buildMenu(this, {
      gameId: GAME_ID,
      title: ['NEON', 'LANDER'],
      colors: [NEON.green, NEON.cyan],
      help: `Turn: ${helpKeys(['left', 'right'], '← →')} / stick    Thrust: ${helpKeys('up', '↑')} / ${helpKeys('action', 'Space')} / A\nTouch down slow and upright on the pad    Touch: left stick, THRUST button    Pause: ${helpKeys('pause', 'P')} / Start`,
      // Daily: the same terrain, pads and wind for everyone on a given (UTC) date, with its own best score.
      modes: DAILY_MODES,
    });
  }

  update(now: number): void {
    const on = reducedMotion() || Math.floor(now / 400) % 2 === 0;
    // Redraw only when the lights switch.
    if (on === this.lit) return;
    this.lit = on;
    const g = this.padLights.clear();
    if (!on) return;
    g.fillStyle(NEON.green, 1).fillCircle(this.padX, this.padY - 3, 3).fillCircle(this.padX + this.padW, this.padY - 3, 3);
  }
}
