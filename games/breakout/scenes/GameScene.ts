import Phaser from 'phaser';
import {
  BALL_BASE_SPEED,
  BALL_MAX_SPEED,
  BALL_RADIUS,
  BALL_SPEED_PER_LEVEL,
  BRICK_GAP,
  BRICK_H,
  BRICK_TOP,
  BRICK_W,
  COLORS,
  COLS,
  HEIGHT,
  LEVELS,
  MAX_BOUNCE_ANGLE,
  PADDLE_Y,
  POWERUP_CHANCE,
  ROW_COLORS,
  START_LIVES,
  WIDE_DURATION_MS,
  WIDTH,
} from '../config';
import { isMuted, noise, setMuted, tone } from '../../../shared/sfx';
import { neonText, PIXEL_FONT } from './ui';

type Img = Phaser.Physics.Arcade.Image;

interface GameData {
  level: number;
  score: number;
  lives?: number;
}

type PowerUpKind = 'wide' | 'multi' | 'slow' | 'life';

const POWERUPS: Record<PowerUpKind, { color: number; label: string; weight: number }> = {
  wide: { color: COLORS.green, label: 'W', weight: 4 },
  multi: { color: COLORS.purple, label: 'M', weight: 3 },
  slow: { color: COLORS.yellow, label: 'S', weight: 3 },
  life: { color: COLORS.pink, label: '+', weight: 1 },
};

const KEYBOARD_PADDLE_SPEED = 720;
const SLOW_FACTOR = 0.7;
const SLOW_DURATION_MS = 8000;

export class GameScene extends Phaser.Scene {
  private level = 0;
  private score = 0;
  private lives = START_LIVES;
  private combo = 0;
  private speedFactor = 1;
  private stuck = true;
  private levelDone = false;
  private targetX = WIDTH / 2;

  private paddle!: Img;
  private balls!: Phaser.Physics.Arcade.Group;
  private bricks!: Phaser.Physics.Arcade.StaticGroup;
  private powerups!: Phaser.Physics.Arcade.Group;
  private burst!: Phaser.GameObjects.Particles.ParticleEmitter;

  private scoreText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private pauseText!: Phaser.GameObjects.Text;
  private muteText!: Phaser.GameObjects.Text;
  private lifeIcons: Phaser.GameObjects.Image[] = [];
  private keys!: Record<'left' | 'right' | 'a' | 'd', Phaser.Input.Keyboard.Key>;

  private wideTimer?: Phaser.Time.TimerEvent;
  private slowTimer?: Phaser.Time.TimerEvent;

  constructor() {
    super('Game');
  }

  init(data: GameData): void {
    this.level = data.level ?? 0;
    this.score = data.score ?? 0;
    this.lives = data.lives ?? START_LIVES;
    this.combo = 0;
    this.speedFactor = 1;
    this.stuck = true;
    this.levelDone = false;
    this.targetX = WIDTH / 2;
    this.lifeIcons = [];
    this.wideTimer = undefined;
    this.slowTimer = undefined;
  }

  private get ballSpeed(): number {
    return Math.min(BALL_BASE_SPEED + this.level * BALL_SPEED_PER_LEVEL, BALL_MAX_SPEED) * this.speedFactor;
  }

  create(): void {
    this.cameras.main.fadeIn(250, 5, 5, 13);
    this.drawBackground();

    this.physics.world.setBoundsCollision(true, true, true, false);

    this.paddle = this.physics.add.image(WIDTH / 2, PADDLE_Y, 'paddle').setTint(COLORS.cyan).setImmovable(true);
    this.paddle.setCollideWorldBounds(true);
    this.paddle.preFX?.addGlow(COLORS.cyan, 4, 0, false);

    this.balls = this.physics.add.group();
    this.powerups = this.physics.add.group();
    this.bricks = this.physics.add.staticGroup();
    this.buildLevel();

    this.burst = this.add.particles(0, 0, 'spark', {
      speed: { min: 80, max: 340 },
      lifespan: 650,
      scale: { start: 1, end: 0 },
      alpha: { start: 1, end: 0 },
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });

    this.spawnBall(true);

    this.physics.add.collider(this.paddle, this.balls, (a, b) => this.onPaddleHit(this.pick(a, b, 'ball')));
    this.physics.add.collider(this.balls, this.bricks, (a, b) =>
      this.onBrickHit(this.pick(a, b, 'ball'), this.pick(a, b, 'brick')),
    );
    this.physics.add.overlap(this.paddle, this.powerups, (a, b) => this.collectPowerUp(this.pick(a, b, 'pill')));
    this.physics.world.on('worldbounds', () => tone({ freq: 300, duration: 0.05, volume: 0.04 }));

    this.createHud();
    this.bindInput();
    this.showBanner(`LEVEL ${this.level + 1}`);
  }

  // ---------------------------------------------------------------- setup

  private drawBackground(): void {
    const g = this.add.graphics();
    g.lineStyle(1, COLORS.purple, 0.08);
    for (let x = 0; x <= WIDTH; x += 40) g.lineBetween(x, 0, x, HEIGHT);
    for (let y = 0; y <= HEIGHT; y += 40) g.lineBetween(0, y, WIDTH, y);
  }

  private buildLevel(): void {
    const layout = LEVELS[this.level % LEVELS.length];
    const rowWidth = COLS * BRICK_W + (COLS - 1) * BRICK_GAP;
    const startX = (WIDTH - rowWidth) / 2 + BRICK_W / 2;

    layout.forEach((row, r) => {
      [...row].forEach((cell, c) => {
        const hp = Number(cell);
        if (!hp) return;
        const x = startX + c * (BRICK_W + BRICK_GAP);
        const y = BRICK_TOP + r * (BRICK_H + BRICK_GAP);
        const color = hp >= 3 ? COLORS.white : ROW_COLORS[r % ROW_COLORS.length];
        const brick = this.bricks.create(x, y, 'brick') as Img;
        brick.setTint(color).setData({ hp, maxHp: hp, color });
        this.styleBrick(brick);

        // Pop in row by row for a bit of flair.
        const targetAlpha = brick.alpha;
        brick.setAlpha(0).setScale(0.4);
        this.tweens.add({
          targets: brick,
          alpha: targetAlpha,
          scale: 1,
          duration: 350,
          delay: r * 60 + c * 25,
          ease: 'Back.easeOut',
        });
      });
    });
  }

  /** Armored bricks look dimmer the more damage they've taken. */
  private styleBrick(brick: Img): void {
    const hp = brick.getData('hp') as number;
    const maxHp = brick.getData('maxHp') as number;
    brick.setAlpha(maxHp === 1 ? 0.95 : 0.45 + 0.55 * (hp / maxHp));
  }

  private spawnBall(attached: boolean, from?: Img): Img {
    const x = from?.x ?? this.paddle.x;
    const y = from?.y ?? PADDLE_Y - 8 - BALL_RADIUS - 2;
    const ball = this.balls.create(x, y, 'ball') as Img;
    ball.setCircle(BALL_RADIUS).setBounce(1).setCollideWorldBounds(true);
    (ball.body as Phaser.Physics.Arcade.Body).onWorldBounds = true;
    ball.preFX?.addGlow(COLORS.white, 4, 0, false);

    const trail = this.add.particles(0, 0, 'spark', {
      follow: ball,
      lifespan: 260,
      frequency: 16,
      scale: { start: 1.2, end: 0 },
      alpha: { start: 0.5, end: 0 },
      tint: COLORS.cyan,
      blendMode: Phaser.BlendModes.ADD,
    });
    trail.setDepth(-1);
    ball.setData('trail', trail);

    if (!attached) {
      const angle = Phaser.Math.FloatBetween(-MAX_BOUNCE_ANGLE, MAX_BOUNCE_ANGLE);
      ball.setVelocity(this.ballSpeed * Math.sin(angle), -this.ballSpeed * Math.cos(angle));
    }
    return ball;
  }

  private createHud(): void {
    const style = { fontFamily: PIXEL_FONT, fontSize: '16px', color: '#e8e8ff' };
    this.scoreText = this.add.text(WIDTH / 2, 24, '', style).setOrigin(0.5);
    this.comboText = this.add.text(WIDTH / 2, 50, '', { ...style, fontSize: '12px', color: '#ffe45e' }).setOrigin(0.5);
    this.levelText = this.add.text(WIDTH - 20, 24, `LV ${this.level + 1}`, style).setOrigin(1, 0.5);
    this.muteText = this.add
      .text(WIDTH - 20, HEIGHT - 14, '', { ...style, fontSize: '10px', color: '#8a8ab8' })
      .setOrigin(1, 0.5);
    this.hint = neonText(this, WIDTH / 2, PADDLE_Y - 70, 'CLICK OR SPACE TO LAUNCH', 12, COLORS.white).setAlpha(0.8);
    this.tweens.add({ targets: this.hint, alpha: 0.2, duration: 600, yoyo: true, repeat: -1 });
    this.pauseText = neonText(this, WIDTH / 2, HEIGHT / 2, 'PAUSED', 36, COLORS.yellow).setVisible(false).setDepth(10);
    this.updateHud();
    this.updateLives();
  }

  private bindInput(): void {
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys({
      left: Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      a: Phaser.Input.Keyboard.KeyCodes.A,
      d: Phaser.Input.Keyboard.KeyCodes.D,
    }) as GameScene['keys'];

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => (this.targetX = p.x));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.targetX = p.x;
      this.launch();
    });
    kb.on('keydown-SPACE', () => this.launch());
    kb.on('keydown-UP', () => this.launch());
    kb.on('keydown-P', () => this.togglePause());
    kb.on('keydown-ESC', () => this.togglePause());
    kb.on('keydown-M', () => {
      setMuted(!isMuted());
      this.updateHud();
    });

    // Auto-pause when the tab is hidden so players don't lose a life while away.
    this.game.events.on(Phaser.Core.Events.BLUR, this.pauseIfRunning, this);
    // (The physics world clears its own 'worldbounds' listeners when the scene shuts down.)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.BLUR, this.pauseIfRunning, this);
    });
  }

  // ---------------------------------------------------------------- loop

  update(_time: number, deltaMs: number): void {
    if (this.physics.world.isPaused) return;
    const dt = deltaMs / 1000;

    // Keyboard nudges the target; pointer sets it directly.
    const dir =
      (this.keys.right.isDown || this.keys.d.isDown ? 1 : 0) - (this.keys.left.isDown || this.keys.a.isDown ? 1 : 0);
    if (dir !== 0) this.targetX += dir * KEYBOARD_PADDLE_SPEED * dt;
    const half = this.paddle.displayWidth / 2;
    this.targetX = Phaser.Math.Clamp(this.targetX, half, WIDTH - half);
    this.paddle.setVelocityX(Phaser.Math.Clamp((this.targetX - this.paddle.x) * 18, -1600, 1600));

    for (const obj of this.balls.getChildren()) {
      const ball = obj as Img;
      const body = ball.body as Phaser.Physics.Arcade.Body;
      if (this.stuck) {
        body.reset(this.paddle.x, PADDLE_Y - 8 - BALL_RADIUS - 2);
        continue;
      }
      if (ball.y > HEIGHT + 30) {
        this.removeBall(ball);
        continue;
      }
      this.normalizeVelocity(body);
    }

    for (const obj of this.powerups.getChildren()) {
      const pill = obj as Img;
      (pill.getData('label') as Phaser.GameObjects.Text).setPosition(pill.x, pill.y);
      if (pill.y > HEIGHT + 20) this.removePowerUp(pill);
    }

    if (!this.stuck && !this.levelDone && this.balls.countActive() === 0) this.loseLife();
  }

  /** Keeps ball speed constant and stops it from getting stuck in near-horizontal loops. */
  private normalizeVelocity(body: Phaser.Physics.Arcade.Body): void {
    const speed = this.ballSpeed;
    const v = body.velocity;
    const minVy = speed * 0.3;
    if (Math.abs(v.y) < minVy) v.y = (v.y <= 0 ? -1 : 1) * minVy;
    v.setLength(speed);
  }

  // ---------------------------------------------------------------- events

  private launch(): void {
    if (!this.stuck || this.levelDone || this.physics.world.isPaused) return;
    this.stuck = false;
    this.hint.setVisible(false);
    const ball = this.balls.getFirstAlive() as Img | null;
    if (!ball) return;
    const offset = Phaser.Math.Clamp((this.paddle.body!.velocity.x / 1600) * 0.6, -0.5, 0.5);
    const angle = offset * MAX_BOUNCE_ANGLE;
    ball.setVelocity(this.ballSpeed * Math.sin(angle), -this.ballSpeed * Math.cos(angle));
    tone({ freq: 440, toFreq: 880, duration: 0.12 });
  }

  private onPaddleHit(ball: Img): void {
    if (this.stuck) return;
    // Bounce angle depends on where the ball hit the paddle: edges send it wide.
    const offset = Phaser.Math.Clamp((ball.x - this.paddle.x) / (this.paddle.displayWidth / 2), -1, 1);
    const angle = offset * MAX_BOUNCE_ANGLE;
    ball.setVelocity(this.ballSpeed * Math.sin(angle), -this.ballSpeed * Math.cos(angle));

    this.combo = 0;
    this.updateHud();
    tone({ freq: 220, toFreq: 330, duration: 0.08, type: 'triangle', volume: 0.1 });
    this.tweens.add({ targets: this.paddle, scaleY: 0.6, duration: 60, yoyo: true });
  }

  private onBrickHit(_ball: Img, brick: Img): void {
    if (!brick.active) return;
    const hp = (brick.getData('hp') as number) - 1;
    const color = brick.getData('color') as number;

    if (hp > 0) {
      brick.setData('hp', hp);
      this.styleBrick(brick);
      brick.setTintFill(COLORS.white);
      this.time.delayedCall(60, () => brick.active && brick.setTint(color));
      tone({ freq: 160, duration: 0.06, type: 'sawtooth', volume: 0.06 });
      return;
    }

    this.combo++;
    const points = 10 * (brick.getData('maxHp') as number) * Math.min(this.combo, 8);
    this.score += points;
    this.updateHud();
    this.floatText(brick.x, brick.y, `+${points}`, color);

    this.burst.setParticleTint(color);
    this.burst.explode(18, brick.x, brick.y);
    this.cameras.main.shake(70, 0.004);
    tone({ freq: 520 + Math.min(this.combo, 12) * 60, duration: 0.09, volume: 0.07 });

    if (Math.random() < POWERUP_CHANCE) this.spawnPowerUp(brick.x, brick.y);
    brick.destroy();

    if (this.bricks.countActive() === 0) this.clearLevel();
  }

  private spawnPowerUp(x: number, y: number): void {
    const kinds = Object.keys(POWERUPS) as PowerUpKind[];
    const total = kinds.reduce((sum, k) => sum + POWERUPS[k].weight, 0);
    let roll = Math.random() * total;
    const kind = kinds.find((k) => (roll -= POWERUPS[k].weight) < 0) ?? 'wide';
    const { color, label } = POWERUPS[kind];

    const pill = this.powerups.create(x, y, 'pill') as Img;
    pill.setTint(color).setVelocityY(150).setData('kind', kind);
    pill.preFX?.addGlow(color, 3, 0, false);
    const text = this.add
      .text(x, y, label, { fontFamily: PIXEL_FONT, fontSize: '10px', color: '#05050d' })
      .setOrigin(0.5)
      .setDepth(1);
    pill.setData('label', text);
  }

  private removePowerUp(pill: Img): void {
    (pill.getData('label') as Phaser.GameObjects.Text).destroy();
    pill.destroy();
  }

  private collectPowerUp(pill: Img): void {
    if (!pill.active) return;
    const kind = pill.getData('kind') as PowerUpKind;
    const { color } = POWERUPS[kind];
    this.removePowerUp(pill);
    this.burst.setParticleTint(color);
    this.burst.explode(24, this.paddle.x, PADDLE_Y);
    tone({ freq: 660, toFreq: 1320, duration: 0.2, type: 'triangle', volume: 0.1 });

    switch (kind) {
      case 'wide':
        this.tweens.add({ targets: this.paddle, scaleX: 1.5, duration: 200, ease: 'Back.easeOut' });
        this.wideTimer?.remove();
        this.wideTimer = this.time.delayedCall(WIDE_DURATION_MS, () =>
          this.tweens.add({ targets: this.paddle, scaleX: 1, duration: 200 }),
        );
        this.floatText(this.paddle.x, PADDLE_Y - 30, 'WIDE', color);
        break;
      case 'multi': {
        const source = (this.balls.getFirstAlive() as Img | null) ?? undefined;
        if (!this.stuck && source) {
          this.spawnBall(false, source);
          this.spawnBall(false, source);
        }
        this.floatText(this.paddle.x, PADDLE_Y - 30, 'MULTI', color);
        break;
      }
      case 'slow':
        this.speedFactor = SLOW_FACTOR;
        this.slowTimer?.remove();
        this.slowTimer = this.time.delayedCall(SLOW_DURATION_MS, () => (this.speedFactor = 1));
        this.floatText(this.paddle.x, PADDLE_Y - 30, 'SLOW', color);
        break;
      case 'life':
        this.lives++;
        this.updateLives();
        this.floatText(this.paddle.x, PADDLE_Y - 30, '1UP', color);
        break;
    }
  }

  private removeBall(ball: Img): void {
    const trail = ball.getData('trail') as Phaser.GameObjects.Particles.ParticleEmitter;
    trail.stop();
    this.time.delayedCall(300, () => trail.destroy());
    ball.destroy();
  }

  private loseLife(): void {
    this.lives--;
    this.combo = 0;
    this.updateLives();
    this.updateHud();
    this.cameras.main.shake(250, 0.012);
    this.cameras.main.flash(200, 255, 46, 151);
    noise(0.35, 0.12);
    tone({ freq: 300, toFreq: 60, duration: 0.5, type: 'sawtooth', volume: 0.08 });

    // Clear lingering power-ups so a fresh ball starts clean.
    for (const p of [...this.powerups.getChildren()]) this.removePowerUp(p as Img);
    this.wideTimer?.remove();
    this.slowTimer?.remove();
    this.speedFactor = 1;
    this.tweens.add({ targets: this.paddle, scaleX: 1, duration: 150 });

    if (this.lives <= 0) {
      this.levelDone = true;
      this.time.delayedCall(700, () => this.scene.start('GameOver', { score: this.score, level: this.level }));
      return;
    }
    this.stuck = true;
    this.spawnBall(true);
    this.hint.setVisible(true);
  }

  private clearLevel(): void {
    this.levelDone = true;
    const bonus = 250 * (this.level + 1);
    this.score += bonus;
    this.updateHud();

    // We're usually inside a ball/brick collision callback here, so freeze the balls now
    // and destroy them after the physics step finishes.
    for (const b of [...this.balls.getChildren()]) {
      const ball = b as Img;
      this.burst.setParticleTint(COLORS.cyan);
      this.burst.explode(20, ball.x, ball.y);
      (ball.body as Phaser.Physics.Arcade.Body).enable = false;
      ball.setVisible(false);
      this.time.delayedCall(0, () => this.removeBall(ball));
    }
    for (const p of [...this.powerups.getChildren()]) this.removePowerUp(p as Img);

    [523, 659, 784, 1047].forEach((freq, i) =>
      this.time.delayedCall(i * 110, () => tone({ freq, duration: 0.18, type: 'triangle', volume: 0.1 })),
    );
    this.showBanner(`LEVEL CLEAR\n+${bonus}`, COLORS.green);
    this.time.delayedCall(1800, () => {
      this.cameras.main.fadeOut(250, 5, 5, 13);
      this.cameras.main.once('camerafadeoutcomplete', () =>
        this.scene.restart({ level: this.level + 1, score: this.score, lives: this.lives }),
      );
    });
  }

  private pauseIfRunning(): void {
    if (!this.physics.world.isPaused && !this.levelDone) this.togglePause();
  }

  private togglePause(): void {
    if (this.levelDone) return;
    const paused = !this.physics.world.isPaused;
    if (paused) {
      this.physics.pause();
      this.tweens.pauseAll();
    } else {
      this.physics.resume();
      this.tweens.resumeAll();
    }
    this.time.paused = paused;
    this.pauseText.setVisible(paused);
  }

  // ---------------------------------------------------------------- hud

  private updateHud(): void {
    this.scoreText.setText(this.score.toLocaleString());
    this.comboText.setText(this.combo > 1 ? `COMBO x${Math.min(this.combo, 8)}` : '');
    this.muteText.setText(isMuted() ? 'MUTED (M)' : '');
  }

  private updateLives(): void {
    this.lifeIcons.forEach((i) => i.destroy());
    this.lifeIcons = Array.from({ length: Math.max(this.lives, 0) }, (_, i) =>
      this.add.image(WIDTH - 26 - i * 20, 50, 'ball').setTint(COLORS.pink).setScale(0.8),
    );
    this.levelText.setText(`LV ${this.level + 1}`);
  }

  private floatText(x: number, y: number, text: string, color: number): void {
    const t = neonText(this, x, y, text, 12, color).setDepth(5);
    this.tweens.add({ targets: t, y: y - 40, alpha: 0, duration: 700, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  private showBanner(text: string, color: number = COLORS.cyan): void {
    const banner = neonText(this, WIDTH / 2, HEIGHT / 2 + 40, text, 28, color).setDepth(10).setScale(0.5).setAlpha(0);
    this.tweens.chain({
      targets: banner,
      tweens: [
        { scale: 1, alpha: 1, duration: 300, ease: 'Back.easeOut' },
        { alpha: 0, duration: 400, delay: 900 },
      ],
      onComplete: () => banner.destroy(),
    });
  }

  /** Arcade collider callbacks don't guarantee argument order — find the object by texture key. */
  private pick(a: unknown, b: unknown, key: string): Img {
    return ((a as Img).texture?.key === key ? a : b) as Img;
  }
}
