import Phaser from 'phaser';
import {
  BALL_SIZE,
  BOTTOM,
  CPU_ERROR,
  GAME_ID,
  HEIGHT,
  PADDLE_H,
  PADDLE_SPEED,
  PADDLE_W,
  PADDLE_X,
  POINTS_TO_WIN,
  SERVE_DELAY_MS,
  SERVE_SPEED,
  TOP,
  WIDTH,
} from '../config';
import { bounceOffPaddle, cpuAimError, cpuMove, matchScore, touchesPaddle } from '../rules';
import { trophiesFor } from '../../../shared/achievements';
import { ArcadeControls } from '../../../shared/controls';
import { PauseController } from '../../../shared/pause';
import { endRun, showMatchResult } from '../../../shared/scenes';
import { noise, tone } from '../../../shared/sfx';
import { burstEmitter, hex, HUD_LABEL_STYLE, HUD_STYLE, impact, NEON, PIXEL_FONT, sparkTexture } from '../../../shared/ui';
import type { TROPHIES } from '../trophies';

const { reach, unlock } = trophiesFor<typeof TROPHIES>();

interface Paddle {
  side: -1 | 1;
  x: number;
  y: number;
  vy: number;
  color: number;
  score: number;
  cpu: boolean;
  controls?: ArcadeControls;
  /** Where a finger is asking this paddle to go (touch play). */
  touchY: number | null;
  /** CPU only: its current aim offset, re-rolled on every hit so it isn't perfect. */
  aimError: number;
}

export interface PongData {
  players?: 1 | 2;
}

export class GameScene extends Phaser.Scene {
  private versus = false;
  private paddles: Paddle[] = [];
  private ball = { x: WIDTH / 2, y: HEIGHT / 2, vx: 0, vy: 0, speed: SERVE_SPEED };
  private live = false;
  private over = false;
  private rally = 0;
  private touchOwners = new Map<number, Paddle>();

  private gfx!: Phaser.GameObjects.Graphics;
  private burst!: Phaser.GameObjects.Particles.ParticleEmitter;
  private trail!: Phaser.GameObjects.Particles.ParticleEmitter;
  private scoreTexts: Phaser.GameObjects.Text[] = [];
  private rallyText!: Phaser.GameObjects.Text;
  private pause!: PauseController;

  constructor() {
    super('Game');
  }

  init(data: PongData): void {
    this.versus = data.players === 2;
    this.live = false;
    this.over = false;
    this.rally = 0;
    this.touchOwners = new Map();
  }

  create(): void {
    this.cameras.main.fadeIn(250, 5, 5, 13);
    this.gfx = this.add.graphics();
    this.burst = burstEmitter(this, 260, 500);
    this.trail = this.add
      .particles(0, 0, sparkTexture(this), {
        lifespan: 220,
        frequency: 14,
        scale: { start: 1.3, end: 0 },
        alpha: { start: 0.5, end: 0 },
        tint: NEON.white,
        blendMode: Phaser.BlendModes.ADD,
      })
      .setDepth(-1);

    const make = (side: -1 | 1, color: number, cpu: boolean, seat?: 1 | 2): Paddle => ({
      side,
      x: side < 0 ? PADDLE_X : WIDTH - PADDLE_X,
      y: (TOP + BOTTOM) / 2,
      vy: 0,
      color,
      score: 0,
      cpu,
      controls: cpu ? undefined : new ArcadeControls(this, undefined, seat ? { player: seat } : {}),
      touchY: null,
      aimError: 0,
    });
    this.paddles = this.versus
      ? [make(-1, NEON.cyan, false, 1), make(1, NEON.pink, false, 2)]
      : [make(-1, NEON.cyan, false), make(1, NEON.pink, true)];

    const style = { ...HUD_STYLE, fontSize: '40px' };
    this.scoreTexts = this.paddles.map((p) =>
      this.add
        .text(WIDTH / 2 + p.side * 90, TOP / 2 + 4, '0', { ...style, color: hex(p.color) })
        .setOrigin(0.5)
        .setShadow(0, 0, hex(p.color), 12, false, true),
    );
    const labels = this.versus ? ['P1', 'P2'] : ['YOU', 'CPU'];
    this.paddles.forEach((p, i) =>
      this.add
        .text(WIDTH / 2 + p.side * 190, TOP / 2 + 4, labels[i], { ...HUD_LABEL_STYLE, fontSize: '11px' })
        .setOrigin(0.5),
    );
    this.rallyText = this.add.text(WIDTH / 2, HEIGHT - 34, '', { fontFamily: PIXEL_FONT, fontSize: '11px', color: hex(NEON.yellow) }).setOrigin(0.5);

    const humans = this.paddles.filter((p) => p.controls).map((p) => p.controls!);
    this.pause = new PauseController(this, humans, { canPause: () => !this.over, restartData: { players: this.versus ? 2 : 1 } });
    this.bindTouch();
    this.serve(Math.random() < 0.5 ? -1 : 1);
  }

  /** Solo: any finger steers your paddle. Versus: each finger steers the paddle on its half of the screen. */
  private bindTouch(): void {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const paddle = this.versus ? this.paddles[p.x < WIDTH / 2 ? 0 : 1] : this.paddles[0];
      this.touchOwners.set(p.id, paddle);
      paddle.touchY = p.y;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const paddle = this.touchOwners.get(p.id);
      if (paddle && p.isDown) paddle.touchY = p.y;
    });
    const release = (p: Phaser.Input.Pointer) => {
      const paddle = this.touchOwners.get(p.id);
      if (paddle) paddle.touchY = null;
      this.touchOwners.delete(p.id);
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);
  }

  // ---------------------------------------------------------------- flow

  private serve(towards: -1 | 1): void {
    this.live = false;
    this.rally = 0;
    this.rallyText.setText('');
    this.ball = { x: WIDTH / 2, y: (TOP + BOTTOM) / 2, vx: 0, vy: 0, speed: SERVE_SPEED };
    for (const p of this.paddles) p.aimError = Phaser.Math.FloatBetween(-0.5, 0.5) * CPU_ERROR;
    this.time.delayedCall(SERVE_DELAY_MS, () => {
      if (this.over) return;
      const angle = Phaser.Math.FloatBetween(-0.45, 0.45);
      this.ball.vx = Math.cos(angle) * SERVE_SPEED * towards;
      this.ball.vy = Math.sin(angle) * SERVE_SPEED;
      this.live = true;
      tone({ freq: 440, duration: 0.06, type: 'square', volume: 0.05 });
    });
  }

  update(_time: number, deltaMs: number): void {
    if (this.pause.isPaused) return;
    const dt = Math.min(deltaMs, 50) / 1000;
    for (const p of this.paddles) this.movePaddle(p, dt);
    if (this.live && !this.over) this.moveBall(dt);
    this.trail.setPosition(this.ball.x, this.ball.y);
    this.render();
  }

  private movePaddle(p: Paddle, dt: number): void {
    const before = p.y;
    if (p.cpu) {
      p.y = cpuMove(p, this.ball, this.live, dt);
    } else if (p.touchY !== null) {
      // Fingers get a faster, snappier follow than keys.
      const diff = p.touchY - p.y;
      p.y += Phaser.Math.Clamp(diff, -PADDLE_SPEED * 1.6 * dt, PADDLE_SPEED * 1.6 * dt);
    } else if (p.controls) {
      p.y += p.controls.axisY * PADDLE_SPEED * dt;
    }
    p.y = Phaser.Math.Clamp(p.y, TOP + PADDLE_H / 2, BOTTOM - PADDLE_H / 2);
    p.vy = (p.y - before) / Math.max(dt, 0.001);
  }

  private moveBall(dt: number): void {
    const b = this.ball;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    const half = BALL_SIZE / 2;
    if (b.y - half < TOP && b.vy < 0) {
      b.y = TOP + half;
      b.vy *= -1;
      tone({ freq: 300, duration: 0.03, type: 'square', volume: 0.03 });
    } else if (b.y + half > BOTTOM && b.vy > 0) {
      b.y = BOTTOM - half;
      b.vy *= -1;
      tone({ freq: 300, duration: 0.03, type: 'square', volume: 0.03 });
    }

    for (const p of this.paddles) if (touchesPaddle(b, p)) this.hit(p);

    if (b.x < -30) this.point(this.paddles[1]);
    else if (b.x > WIDTH + 30) this.point(this.paddles[0]);
  }

  private hit(p: Paddle): void {
    const b = this.ball;
    bounceOffPaddle(b, p);
    this.rally++;
    reach('pong.rally', this.rally);
    this.rallyText.setText(this.rally >= 5 ? `RALLY ${this.rally}` : '');
    // The CPU rethinks its aim each time the ball comes back; faster balls make it less precise.
    for (const q of this.paddles) if (q.cpu) q.aimError = cpuAimError(b.speed, Phaser.Math.FloatBetween(-1, 1));
    this.burst.setParticleTint(p.color);
    this.burst.explode(10, b.x, b.y);
    tone({ freq: 440 + Math.min(this.rally, 20) * 20, duration: 0.05, type: 'square', volume: 0.06 });
  }

  private point(scorer: Paddle): void {
    this.live = false;
    scorer.score++;
    this.scoreTexts[this.paddles.indexOf(scorer)].setText(String(scorer.score));
    // The player who let the ball through feels the point (a CPU paddle has no gamepad).
    impact(
      this,
      this.paddles.filter((p) => p !== scorer && p.controls).map((p) => p.controls!),
      180,
      0.008,
    );
    this.burst.setParticleTint(scorer.color);
    this.burst.explode(30, Phaser.Math.Clamp(this.ball.x, 0, WIDTH), this.ball.y);
    noise(0.2, 0.08);
    tone({ freq: 220, toFreq: 660, duration: 0.18, type: 'triangle', volume: 0.08 });
    if (scorer.score >= POINTS_TO_WIN) {
      this.endMatch(scorer);
      return;
    }
    const loser = this.paddles.find((p) => p !== scorer)!;
    this.serve(loser.side);
  }

  private endMatch(winner: Paddle): void {
    this.over = true;
    const [you, other] = this.paddles;
    if (!this.versus) {
      const won = winner === you;
      if (won) unlock('pong.win');
      if (won && other.score === 0) unlock('pong.shutout');
      const score = matchScore(you.score, other.score, won);
      const detail = won ? `YOU WIN ${you.score}-${other.score}` : `CPU WINS ${other.score}-${you.score}`;
      endRun(this, { gameId: GAME_ID, score, detail }, 900);
      return;
    }
    unlock('pong.versus');
    showMatchResult(this, [you.controls!, other.controls!], {
      gameId: GAME_ID,
      title: `PLAYER ${winner === you ? 1 : 2} WINS!`,
      color: winner.color,
      tally: `${you.score} - ${other.score}`,
      rematchData: { players: 2 },
    });
  }

  // ---------------------------------------------------------------- render

  private render(): void {
    const g = this.gfx.clear();
    g.lineStyle(2, NEON.purple, 0.5).lineBetween(0, TOP, WIDTH, TOP).lineBetween(0, BOTTOM, WIDTH, BOTTOM);
    g.fillStyle(NEON.white, 0.18);
    for (let y = TOP + 8; y < BOTTOM; y += 28) g.fillRect(WIDTH / 2 - 2, y, 4, 14);

    for (const p of this.paddles) {
      g.fillStyle(p.color, 0.2).fillRoundedRect(p.x - PADDLE_W / 2 - 5, p.y - PADDLE_H / 2 - 5, PADDLE_W + 10, PADDLE_H + 10, 8);
      g.fillStyle(p.color, 1).fillRoundedRect(p.x - PADDLE_W / 2, p.y - PADDLE_H / 2, PADDLE_W, PADDLE_H, 6);
    }
    const b = this.ball;
    const pulse = this.live ? 1 : 0.5 + Math.abs(Math.sin(this.time.now / 150)) * 0.5;
    g.fillStyle(NEON.white, 0.25 * pulse).fillCircle(b.x, b.y, BALL_SIZE);
    g.fillStyle(NEON.white, pulse).fillRect(b.x - BALL_SIZE / 2, b.y - BALL_SIZE / 2, BALL_SIZE, BALL_SIZE);
  }
}
