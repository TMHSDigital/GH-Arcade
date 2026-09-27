import Phaser from 'phaser';
import { GAME_ID, HEIGHT, WIDTH } from '../config';
import { makeSprites, ROW_KINDS } from '../sprites';
import { buildMenu } from '../../../shared/scenes';
import { NEON, reducedMotion } from '../../../shared/ui';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create(): void {
    makeSprites(this);
    const stars = this.add.graphics();
    for (let i = 0; i < 70; i++) {
      stars.fillStyle(0xffffff, Phaser.Math.FloatBetween(0.08, 0.4)).fillCircle(Phaser.Math.Between(0, WIDTH), Phaser.Math.Between(0, HEIGHT), 1);
    }
    // A faint formation marching behind the title.
    const colors = [NEON.purple, NEON.pink, NEON.pink, NEON.green, NEON.green];
    const row = this.add.container(0, 0).setAlpha(0.22);
    ROW_KINDS.forEach((kind, r) => {
      for (let c = 0; c < 11; c++) {
        row.add(this.add.image(150 + c * 50, 100 + r * 44, `${kind}0`).setTint(colors[r]));
      }
    });
    if (!reducedMotion()) {
      this.tweens.add({ targets: row, x: 60, duration: 2400, yoyo: true, repeat: -1, ease: 'Stepped', easeParams: [8] });
      this.time.addEvent({
        delay: 300,
        loop: true,
        callback: () =>
          row.each((img: Phaser.GameObjects.Image) => img.setTexture(img.texture.key.endsWith('0') ? img.texture.key.replace('0', '1') : img.texture.key.replace('1', '0'))),
      });
    }

    buildMenu(this, {
      gameId: GAME_ID,
      title: ['STAR', 'SIEGE'],
      colors: [NEON.yellow, NEON.green],
      help: 'Move: ← → / stick / drag    Fire: Space / A / hold a finger down\nCo-op: P1 A D + Space or pad 1, P2 arrows + Enter or pad 2    Pause: P / Start',
      modes: [
        { label: '1 PLAYER', data: { players: 1 } },
        { label: '2 PLAYER CO-OP', data: { players: 2 } },
      ],
    });
  }
}
