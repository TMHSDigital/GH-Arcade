import Phaser from 'phaser';
import { GAME_ID, HEIGHT, PIECE_COLORS, WIDTH } from '../config';
import { PIECE_TYPES, ROTATIONS } from '../logic';
import { buildMenu } from '../../../shared/scenes';
import { NEON, reducedMotion } from '../../../shared/ui';

const CELL = 22;

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create(): void {
    // Pieces drifting down and slowly turning behind the title.
    PIECE_TYPES.concat(PIECE_TYPES).forEach((type, i) => {
      const g = this.add.graphics();
      ROTATIONS[type][0].forEach((row, r) =>
        row.forEach((v, c) => {
          if (v) g.fillStyle(PIECE_COLORS[type], 1).fillRoundedRect(c * CELL - 2 * CELL, r * CELL - 2 * CELL, CELL - 3, CELL - 3, 4);
        }),
      );
      const container = this.add.container(60 + ((i * 97) % (WIDTH - 120)), -100 - i * 90, [g]).setAlpha(0.18);
      if (reducedMotion()) {
        container.setY(40 + ((i * 131) % (HEIGHT - 80))).setAngle((i % 4) * 90);
        return;
      }
      this.tweens.add({
        targets: container,
        y: HEIGHT + 100,
        angle: Phaser.Math.Between(-1, 1) * 90,
        duration: 9000 + (i % 5) * 1500,
        delay: i * 600,
        repeat: -1,
      });
    });

    buildMenu(this, {
      gameId: GAME_ID,
      title: ['NEON', 'STACK'],
      colors: [NEON.purple, NEON.yellow],
      help: 'Move: ← → / drag    Rotate: ↑ X Z / tap    Hard drop: Space / flick up\nHold: C / Shift    Gamepad: d-pad, A B rotate, Y hold, up drops    Pause: P / Start',
    });
  }
}
