import Phaser from 'phaser';
import { GAME_ID, HEIGHT, ROW_COLORS, WIDTH } from '../config';
import { buildMenu } from '../../../shared/scenes';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create(): void {
    // Decorative falling bricks in the background.
    for (let i = 0; i < 18; i++) {
      const brick = this.add
        .image(Phaser.Math.Between(0, WIDTH), Phaser.Math.Between(-HEIGHT, HEIGHT), 'brick')
        .setTint(Phaser.Utils.Array.GetRandom(ROW_COLORS))
        .setAlpha(0.15)
        .setAngle(Phaser.Math.Between(-30, 30));
      this.tweens.add({
        targets: brick,
        y: brick.y + HEIGHT * 1.5,
        angle: brick.angle + Phaser.Math.Between(-90, 90),
        duration: Phaser.Math.Between(8000, 16000),
        repeat: -1,
        onRepeat: () => brick.setX(Phaser.Math.Between(0, WIDTH)),
      });
    }

    buildMenu(this, {
      gameId: GAME_ID,
      title: ['NEON', 'BREAKOUT'],
      help: 'Move: mouse / touch / ← → / stick    Launch: click / space / A\nPause: P / Start    Mute: M',
      startData: { level: 0, score: 0 },
    });
  }
}
