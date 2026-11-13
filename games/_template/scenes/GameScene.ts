import Phaser from 'phaser';
import { DOT_POINTS, GAME_ID, HEIGHT, ROUND_SECONDS, SPEED, WIDTH } from '../config';
import { ArcadeControls } from '../../../shared/controls';
import { PauseController } from '../../../shared/pause';
import { endRun, SCENE } from '../../../shared/scenes';
import { tone } from '../../../shared/sfx';
import { drawGrid, NEON, PIXEL_FONT } from '../../../shared/ui';

/**
 * Starter game: move the glowing square and collect dots before the timer runs out. Replace with
 * your game. Keyboard, gamepad and touch all work through ArcadeControls; P / Esc / Start pauses.
 * When the run ends, call endRun(): the shared game-over screen saves the best score and records the play.
 */
export class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Image;
  private dot!: Phaser.Physics.Arcade.Image;
  private controls!: ArcadeControls;
  private pause!: PauseController;
  private score = 0;
  private timeLeft = ROUND_SECONDS;
  private over = false;
  private hud!: Phaser.GameObjects.Text;

  constructor() {
    super(SCENE.game);
  }

  create(): void {
    // Scenes are reused between runs, so reset state here rather than in field initialisers.
    this.score = 0;
    this.timeLeft = ROUND_SECONDS;
    this.over = false;

    drawGrid(this, WIDTH, HEIGHT);
    if (!this.textures.exists('player')) {
      const g = this.add.graphics();
      g.fillStyle(0xffffff).fillRoundedRect(0, 0, 32, 32, 6).generateTexture('player', 32, 32);
      g.clear().fillStyle(0xffffff).fillCircle(8, 8, 8).generateTexture('dot', 16, 16);
      g.destroy();
    }

    this.player = this.physics.add.image(WIDTH / 2, HEIGHT / 2, 'player').setTint(NEON.cyan).setCollideWorldBounds(true);
    this.player.preFX?.addGlow(NEON.cyan, 4);
    this.dot = this.physics.add.image(0, 0, 'dot').setTint(NEON.pink);
    this.moveDot();

    this.controls = new ArcadeControls(this);
    this.pause = new PauseController(this, this.controls, { canPause: () => !this.over });
    this.hud = this.add.text(WIDTH / 2, 24, '', { fontFamily: PIXEL_FONT, fontSize: '16px', color: '#e8e8ff' }).setOrigin(0.5);

    this.physics.add.overlap(this.player, this.dot, () => {
      this.score += DOT_POINTS;
      tone({ freq: 660, toFreq: 990, duration: 0.1 });
      this.moveDot();
    });
  }

  update(_time: number, deltaMs: number): void {
    if (this.pause.isPaused || this.over) return;
    const p = this.input.activePointer;
    if (p.isDown) this.physics.moveTo(this.player, p.x, p.y, SPEED);
    else this.player.setVelocity(this.controls.axisX * SPEED, this.controls.axisY * SPEED);

    this.timeLeft -= deltaMs / 1000;
    this.hud.setText(`SCORE ${this.score}   TIME ${Math.max(0, Math.ceil(this.timeLeft))}`);
    if (this.timeLeft <= 0) this.finish();
  }

  private finish(): void {
    this.over = true;
    this.player.setVelocity(0, 0);
    endRun(this, { gameId: GAME_ID, score: this.score, detail: `${this.score / DOT_POINTS} DOTS` });
  }

  private moveDot(): void {
    this.dot.setPosition(Phaser.Math.Between(40, WIDTH - 40), Phaser.Math.Between(60, HEIGHT - 60));
  }
}
