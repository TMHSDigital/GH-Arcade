import Phaser from 'phaser';
import { COLORS, GAME_ID, HEIGHT, ROW_COLORS, WIDTH } from '../config';
import { getHighScore } from '../../../shared/storage';
import { neonText, onStart } from './ui';

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

    neonText(this, WIDTH / 2, 170, 'NEON', 56, COLORS.pink);
    neonText(this, WIDTH / 2, 240, 'BREAKOUT', 56, COLORS.cyan);

    const best = getHighScore(GAME_ID);
    if (best > 0) neonText(this, WIDTH / 2, 320, `BEST ${best.toLocaleString()}`, 16, COLORS.yellow);

    const prompt = neonText(this, WIDTH / 2, 410, 'CLICK OR PRESS SPACE', 16, COLORS.white);
    this.tweens.add({ targets: prompt, alpha: 0.2, duration: 600, yoyo: true, repeat: -1 });

    this.add
      .text(
        WIDTH / 2,
        HEIGHT - 60,
        'Move: mouse / touch / ← →    Launch: click / space\nPause: P    Mute: M',
        { fontFamily: 'system-ui, sans-serif', fontSize: '15px', color: '#8a8ab8', align: 'center', lineSpacing: 6 },
      )
      .setOrigin(0.5);

    onStart(this, () => {
      this.cameras.main.fadeOut(250, 5, 5, 13);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Game', { level: 0, score: 0 }));
    });
  }
}
