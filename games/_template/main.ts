import '../../shared/game-shell.css';
import Phaser from 'phaser';
import { createArcadeGame } from '../../shared/phaser-config';
import { getHighScore, submitHighScore } from '../../shared/storage';
import { tone } from '../../shared/sfx';

const GAME_ID = '__SLUG__';
const WIDTH = 800;
const HEIGHT = 600;

/** Starter scene: move the glowing square and collect dots. Replace with your game. */
class MainScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Image;
  private dot!: Phaser.Physics.Arcade.Image;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private score = 0;
  private scoreText!: Phaser.GameObjects.Text;

  constructor() {
    super('Main');
  }

  create(): void {
    const g = this.add.graphics();
    g.fillStyle(0xffffff).fillRoundedRect(0, 0, 32, 32, 6).generateTexture('player', 32, 32);
    g.clear().fillStyle(0xffffff).fillCircle(8, 8, 8).generateTexture('dot', 16, 16);
    g.destroy();

    this.player = this.physics.add.image(WIDTH / 2, HEIGHT / 2, 'player').setTint(0x00f0ff).setCollideWorldBounds(true);
    this.player.preFX?.addGlow(0x00f0ff, 4);
    this.dot = this.physics.add.image(0, 0, 'dot').setTint(0xff2e97);
    this.moveDot();

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.scoreText = this.add.text(WIDTH / 2, 24, '', { fontSize: '20px', color: '#e8e8ff' }).setOrigin(0.5);
    this.add
      .text(WIDTH / 2, HEIGHT - 24, `__TITLE__: arrows or tap to move. Best: ${getHighScore(GAME_ID)}`, {
        fontSize: '14px',
        color: '#8a8ab8',
      })
      .setOrigin(0.5);

    this.physics.add.overlap(this.player, this.dot, () => {
      this.score++;
      submitHighScore(GAME_ID, this.score);
      tone({ freq: 660, toFreq: 990, duration: 0.1 });
      this.moveDot();
    });
  }

  update(): void {
    const speed = 300;
    const p = this.input.activePointer;
    if (p.isDown) {
      this.physics.moveTo(this.player, p.x, p.y, speed);
    } else {
      const vx = (this.cursors.right.isDown ? 1 : 0) - (this.cursors.left.isDown ? 1 : 0);
      const vy = (this.cursors.down.isDown ? 1 : 0) - (this.cursors.up.isDown ? 1 : 0);
      this.player.setVelocity(vx * speed, vy * speed);
    }
    this.scoreText.setText(String(this.score));
  }

  private moveDot(): void {
    this.dot.setPosition(Phaser.Math.Between(40, WIDTH - 40), Phaser.Math.Between(60, HEIGHT - 60));
  }
}

createArcadeGame({ width: WIDTH, height: HEIGHT, scenes: [MainScene] });
