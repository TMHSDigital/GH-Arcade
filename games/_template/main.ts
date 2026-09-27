import '../../shared/game-shell.css';
import Phaser from 'phaser';
import { ArcadeControls } from '../../shared/controls';
import { PauseController } from '../../shared/pause';
import { startArcadeGame } from '../../shared/phaser-config';
import { tone } from '../../shared/sfx';
import { getHighScore, submitHighScore } from '../../shared/storage';
import { drawGrid, NEON, PIXEL_FONT } from '../../shared/ui';

const GAME_ID = '__SLUG__';
const WIDTH = 800;
const HEIGHT = 600;
const SPEED = 300;

/**
 * Starter scene: move the glowing square and collect dots. Replace with your game.
 * Keyboard, gamepad and touch all work through ArcadeControls; P / Esc / Start pauses.
 */
class MainScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Image;
  private dot!: Phaser.Physics.Arcade.Image;
  private controls!: ArcadeControls;
  private pause!: PauseController;
  private score = 0;
  private scoreText!: Phaser.GameObjects.Text;

  constructor() {
    super('Main');
  }

  create(): void {
    drawGrid(this, WIDTH, HEIGHT);
    const g = this.add.graphics();
    g.fillStyle(0xffffff).fillRoundedRect(0, 0, 32, 32, 6).generateTexture('player', 32, 32);
    g.clear().fillStyle(0xffffff).fillCircle(8, 8, 8).generateTexture('dot', 16, 16);
    g.destroy();

    this.player = this.physics.add.image(WIDTH / 2, HEIGHT / 2, 'player').setTint(NEON.cyan).setCollideWorldBounds(true);
    this.player.preFX?.addGlow(NEON.cyan, 4);
    this.dot = this.physics.add.image(0, 0, 'dot').setTint(NEON.pink);
    this.moveDot();

    this.controls = new ArcadeControls(this);
    this.pause = new PauseController(this, this.controls);

    this.scoreText = this.add.text(WIDTH / 2, 24, '', { fontFamily: PIXEL_FONT, fontSize: '16px', color: '#e8e8ff' }).setOrigin(0.5);
    this.add
      .text(WIDTH / 2, HEIGHT - 24, `__TITLE__: arrows, stick or tap to move. Best: ${getHighScore(GAME_ID)}`, {
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
    if (this.pause.isPaused) return;
    const p = this.input.activePointer;
    if (p.isDown) {
      this.physics.moveTo(this.player, p.x, p.y, SPEED);
    } else {
      this.player.setVelocity(this.controls.axisX * SPEED, this.controls.axisY * SPEED);
    }
    this.scoreText.setText(String(this.score));
  }

  private moveDot(): void {
    this.dot.setPosition(Phaser.Math.Between(40, WIDTH - 40), Phaser.Math.Between(60, HEIGHT - 60));
  }
}

void startArcadeGame({ width: WIDTH, height: HEIGHT, scenes: [MainScene] });
