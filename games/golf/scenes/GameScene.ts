import Phaser from 'phaser';
import {
  AIM_FINE,
  AIM_TURN,
  BALL_RADIUS,
  CELL,
  COLS,
  CUP_RADIUS,
  DRAG_RANGE,
  GAME_ID,
  GRID_X,
  GRID_Y,
  HEIGHT,
  MAX_ROLL_SECONDS,
  MAX_STROKES,
  ROWS,
  STEP,
  WIDTH,
} from '../config';
import { BOOST_DIRS, type Hole, HOLES, isSolidTile, parseHole, type Point, tileOf } from '../holes';
import { type Ball, chargePower, dragShot, moverRect, type Rect, shotVelocity, step } from '../physics';
import { atCap, resultName, roundScore, scorecardLines, summarize, toPar, withPenalty } from '../scoring';
import type { TROPHIES } from '../trophies';
import { trophiesFor } from '../../../shared/achievements';
import { ArcadeControls } from '../../../shared/controls';
import { frameSeconds } from '../../../shared/frame';
import { PauseController } from '../../../shared/pause';
import { endRun, SCENE } from '../../../shared/scenes';
import { keyLabel } from '../../../shared/settings';
import { noise, tone } from '../../../shared/sfx';
import { isTouchDevice } from '../../../shared/touch';
import {
  blinkingPrompt,
  burstEmitter,
  floatText,
  HUD_LABEL_STYLE,
  hudText,
  impact,
  NEON,
  neonText,
  reducedMotion,
  showBanner,
} from '../../../shared/ui';

const { unlock, reach } = trophiesFor<typeof TROPHIES>();

const PARS = HOLES.map((h) => h.par);
/** Ball positions kept for the glowing trail, one per frame. */
const TRAIL = 14;
/** The power meter in the HUD. */
const METER = { x: WIDTH - 196, y: 15, w: 176, h: 14 };

/**
 * aim: the ball is still and the player lines up a shot. roll: a shot is under way. sinking and
 * splash: short effects that take no input. card: the scorecard between holes. done: the round is over.
 */
type State = 'aim' | 'roll' | 'sinking' | 'splash' | 'card' | 'done';

export class GameScene extends Phaser.Scene {
  private holeIndex = 0;
  private hole!: Hole;
  /** Strokes on each finished hole. */
  private card: number[] = [];
  /** Strokes so far on this hole, penalties included. */
  private strokes = 0;
  private state: State = 'aim';

  private readonly ball: Ball = { x: 0, y: 0, vx: 0, vy: 0, hit: 0 };
  /** Where the last shot was played from: a ball in the water goes back here. */
  private shotFrom: Point = { x: 0, y: 0 };
  /** Seconds since the hole began, which times the blockers. */
  private simTime = 0;
  private stepDebt = 0;
  private rollTime = 0;
  private lastHitAt = 0;
  /** 0 to 1 while the ball drops into the cup. */
  private readonly sink = { t: 0 };
  private ballVisible = true;

  private aimAngle = 0;
  private power = 0;
  private charging = false;
  private chargeTime = 0;
  /** Where a pointer drag began, while one is under way. */
  private dragFrom: Point | null = null;

  private readonly trail = new Float32Array(TRAIL * 2);
  private trailLength = 0;
  private trailHead = 0;
  private readonly moverBox: Rect = { x: 0, y: 0, w: 0, h: 0 };

  private courseGfx!: Phaser.GameObjects.Graphics;
  private padGfx!: Phaser.GameObjects.Graphics;
  private gfx!: Phaser.GameObjects.Graphics;
  private burst!: Phaser.GameObjects.Particles.ParticleEmitter;
  private holeText!: Phaser.GameObjects.Text;
  private nameText!: Phaser.GameObjects.Text;
  private strokeText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private cardLayer: Phaser.GameObjects.Container | null = null;
  private cardPrompt: Phaser.GameObjects.Text | null = null;
  private cardReady = false;

  private controls!: ArcadeControls;
  private pause!: PauseController;

  constructor() {
    super(SCENE.game);
  }

  init(): void {
    // Scenes are reused between runs, so the run's state starts over here.
    this.holeIndex = 0;
    this.card = [];
    this.state = 'aim';
    this.cardLayer = null;
    this.cardPrompt = null;
    this.cardReady = false;
  }

  create(): void {
    this.cameras.main.fadeIn(250, 5, 5, 13);
    this.courseGfx = this.add.graphics();
    this.padGfx = this.add.graphics();
    this.gfx = this.add.graphics().setDepth(5);
    this.burst = burstEmitter(this, 220, 600);
    if (!reducedMotion()) this.tweens.add({ targets: this.padGfx, alpha: 0.45, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.holeText = hudText(this, 20, 22, '').setOrigin(0, 0.5).setDepth(10);
    this.nameText = this.add.text(20, 46, '', HUD_LABEL_STYLE).setOrigin(0, 0.5).setDepth(10);
    this.strokeText = hudText(this, WIDTH / 2, 22, '').setOrigin(0.5).setDepth(10);
    this.roundText = this.add.text(WIDTH / 2, 46, '', HUD_LABEL_STYLE).setOrigin(0.5).setDepth(10);
    this.add.text(METER.x, 46, 'POWER', HUD_LABEL_STYLE).setOrigin(0, 0.5).setDepth(10);

    this.controls = new ArcadeControls(this);
    this.pause = new PauseController(this, this.controls, { canPause: () => this.state !== 'done' });

    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
    this.input.on('pointerupoutside', this.onPointerUp, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off('pointerdown', this.onPointerDown, this);
      this.input.off('pointermove', this.onPointerMove, this);
      this.input.off('pointerup', this.onPointerUp, this);
      this.input.off('pointerupoutside', this.onPointerUp, this);
    });

    this.startHole(0);
  }

  private startHole(index: number): void {
    this.holeIndex = index;
    this.hole = parseHole(HOLES[index]);
    this.strokes = 0;
    this.simTime = 0;
    this.stepDebt = 0;
    this.rollTime = 0;
    this.placeBall(this.hole.tee);
    this.shotFrom = { ...this.hole.tee };
    this.aimAngle = Math.atan2(this.hole.cup.y - this.hole.tee.y, this.hole.cup.x - this.hole.tee.x);
    this.power = 0;
    this.charging = false;
    this.dragFrom = null;
    this.sink.t = 0;
    this.ballVisible = true;
    this.trailLength = 0;
    this.state = 'aim';
    this.drawCourse();
    this.updateHud();
    showBanner(this, `HOLE ${index + 1}   PAR ${this.hole.par}`, NEON.green, HEIGHT / 2);
  }

  private placeBall(at: Point): void {
    this.ball.x = at.x;
    this.ball.y = at.y;
    this.ball.vx = 0;
    this.ball.vy = 0;
  }

  // ---------------------------------------------------------------- input

  private onPointerDown(p: Phaser.Input.Pointer): void {
    if (this.pause.isPaused) return;
    if (this.state === 'card') {
      this.nextHole();
      return;
    }
    if (this.state !== 'aim') return;
    this.dragFrom = { x: p.x, y: p.y };
    this.charging = false;
    this.power = 0;
  }

  private onPointerMove(p: Phaser.Input.Pointer): void {
    if (!this.dragFrom || this.pause.isPaused || this.state !== 'aim') return;
    const shot = dragShot(p.x - this.dragFrom.x, p.y - this.dragFrom.y, DRAG_RANGE);
    // A tiny drag has no meaningful direction yet, so the aim waits for a real pull.
    if (shot.power > 0.03) this.aimAngle = shot.angle;
    this.power = shot.power;
  }

  private onPointerUp(): void {
    if (!this.dragFrom) return;
    this.dragFrom = null;
    // Letting go of a drag that barely moved (or one the pause menu interrupted) cancels the shot.
    if (this.pause.isPaused || this.state !== 'aim' || this.power < 0.05) {
      this.power = 0;
      return;
    }
    this.shoot();
  }

  /** Keyboard and gamepad aiming, and the held charge. */
  private handleKeys(dt: number): void {
    if (this.state !== 'aim' || this.dragFrom) {
      this.charging = false;
      return;
    }
    const stick = this.controls.pad?.leftStick;
    if (stick && Math.hypot(stick.x, stick.y) > 0.5) {
      // The stick points the shot directly.
      this.aimAngle = Math.atan2(stick.y, stick.x);
    } else {
      const turn = (this.controls.isDown('right') ? 1 : 0) - (this.controls.isDown('left') ? 1 : 0);
      const fine = (this.controls.isDown('down') ? 1 : 0) - (this.controls.isDown('up') ? 1 : 0);
      this.aimAngle += (turn * AIM_TURN + fine * AIM_FINE) * dt;
    }

    if (this.controls.justPressed('action')) {
      this.charging = true;
      this.chargeTime = 0;
    }
    if (!this.charging) return;
    if (this.controls.isDown('action')) {
      this.chargeTime += dt;
      this.power = chargePower(this.chargeTime);
    } else {
      this.charging = false;
      if (this.power >= 0.03) this.shoot();
      else this.power = 0;
    }
  }

  private shoot(): void {
    const v = shotVelocity(this.aimAngle, this.power);
    this.ball.vx = v.vx;
    this.ball.vy = v.vy;
    this.shotFrom = { x: this.ball.x, y: this.ball.y };
    this.strokes++;
    this.state = 'roll';
    this.rollTime = 0;
    tone({ freq: 260 + this.power * 520, toFreq: 140, duration: 0.09, type: 'triangle', volume: 0.08 });
    this.power = 0;
    this.updateHud();
  }

  // ---------------------------------------------------------------- loop

  update(_time: number, deltaMs: number): void {
    if (this.pause.isPaused) return;
    const dt = frameSeconds(deltaMs);
    this.handleKeys(dt);
    if (this.state === 'card' && this.cardReady && this.controls.justPressed('action')) this.nextHole();

    if (this.state === 'aim' || this.state === 'roll') {
      // Fixed steps: the same shot always plays out the same way, whatever the frame rate.
      this.stepDebt += dt;
      while (this.stepDebt >= STEP && (this.state === 'aim' || this.state === 'roll')) {
        this.stepDebt -= STEP;
        this.simTime += STEP;
        this.physicsStep();
      }
    } else {
      // The blockers keep moving behind the effects and the scorecard.
      this.simTime += dt;
    }
    this.render();
  }

  private physicsStep(): void {
    const event = step(this.hole, this.ball, this.simTime);
    if (this.ball.hit > 60 && this.simTime - this.lastHitAt > 0.06) {
      this.lastHitAt = this.simTime;
      const hit = Math.min(this.ball.hit, 900);
      tone({ freq: 240 + hit * 0.5, duration: 0.04, type: 'square', volume: 0.015 + hit / 20000 });
      if (hit > 600) impact(this, this.controls, 60, 0.002);
    }
    if (this.state === 'roll') this.rollTime += STEP;

    if (event === 'sunk') {
      this.holeOut();
    } else if (event === 'water') {
      this.splash();
    } else if (event === 'rest') {
      if (this.state === 'roll') this.settle();
    } else if (this.state === 'aim') {
      // A blocker knocked the resting ball: it rolls without costing a stroke.
      this.state = 'roll';
      this.rollTime = 0;
      this.charging = false;
      this.dragFrom = null;
      this.power = 0;
    } else if (this.rollTime > MAX_ROLL_SECONDS) {
      // Something kept the ball going for good: play the shot again from where it was taken.
      this.placeBall(this.shotFrom);
      floatText(this, GRID_X + this.ball.x, GRID_Y + this.ball.y - 20, 'REPLAY', NEON.white, 12);
      this.settle();
    }
  }

  private settle(): void {
    this.state = 'aim';
    if (atCap(this.strokes)) this.pickUp();
  }

  private splash(): void {
    this.state = 'splash';
    const x = GRID_X + this.ball.x;
    const y = GRID_Y + this.ball.y;
    this.ballVisible = false;
    this.trailLength = 0;
    this.burst.setParticleTint(NEON.blue);
    this.burst.explode(22, x, y);
    noise(0.3, 0.08);
    tone({ freq: 300, toFreq: 90, duration: 0.3, type: 'sine', volume: 0.08 });
    impact(this, this.controls, 140, 0.005);
    this.strokes = withPenalty(this.strokes);
    floatText(this, x, y - 20, 'SPLASH +1', NEON.blue, 12);
    this.updateHud();
    this.time.delayedCall(700, () => {
      this.placeBall(this.shotFrom);
      this.ballVisible = true;
      this.settle();
    });
  }

  private pickUp(): void {
    this.state = 'sinking';
    floatText(this, GRID_X + this.ball.x, GRID_Y + this.ball.y - 20, 'PICKED UP', NEON.pink, 12);
    tone({ freq: 330, toFreq: 160, duration: 0.35, type: 'sawtooth', volume: 0.06 });
    this.finishHole(MAX_STROKES, 'PICKED UP');
  }

  private holeOut(): void {
    this.state = 'sinking';
    const strokes = Math.max(1, this.strokes);
    this.strokes = strokes;
    const name = resultName(strokes, this.hole.par);
    const diff = strokes - this.hole.par;
    const color = strokes === 1 ? NEON.yellow : diff < 0 ? NEON.green : diff === 0 ? NEON.cyan : NEON.pink;
    const cx = GRID_X + this.hole.cup.x;
    const cy = GRID_Y + this.hole.cup.y;

    // The ball slides to the middle of the cup and shrinks as it drops.
    const from = { x: this.ball.x, y: this.ball.y };
    this.sink.t = 0;
    this.tweens.add({
      targets: this.sink,
      t: 1,
      duration: 280,
      ease: 'Quad.easeIn',
      onUpdate: () => {
        this.ball.x = Phaser.Math.Linear(from.x, this.hole.cup.x, this.sink.t);
        this.ball.y = Phaser.Math.Linear(from.y, this.hole.cup.y, this.sink.t);
      },
      onComplete: () => {
        this.ballVisible = false;
        this.burst.setParticleTint(color);
        this.burst.explode(strokes === 1 ? 40 : 22, cx, cy);
        if (!reducedMotion()) {
          const ring = this.add.circle(cx, cy, CUP_RADIUS).setStrokeStyle(3, color).setDepth(6);
          this.tweens.add({ targets: ring, scale: 5, alpha: 0, duration: 550, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
        }
      },
    });
    this.ball.vx = 0;
    this.ball.vy = 0;
    const notes = strokes === 1 ? [523, 659, 784, 1047, 1319] : diff < 0 ? [523, 659, 784, 1047] : [523, 659, 784];
    notes.forEach((f, i) => this.time.delayedCall(200 + i * 90, () => tone({ freq: f, duration: 0.12, type: 'triangle', volume: 0.08 })));
    floatText(this, cx, cy - 28, name, color, 14);
    if (strokes === 1) unlock('golf.ace');
    this.finishHole(strokes, name);
  }

  /** Writes the hole on the card, checks the round's trophies, and shows the card shortly after. */
  private finishHole(strokes: number, name: string): void {
    this.card.push(strokes);
    this.strokes = strokes;
    const summary = summarize(this.card, PARS);
    reach('golf.birdies', summary.birdies);
    if (this.card.length === HOLES.length) {
      if (summary.diff < 0) unlock('golf.under');
      if (summary.clean) unlock('golf.clean');
    }
    this.updateHud();
    this.time.delayedCall(1200, () => this.showCard(name));
  }

  // ---------------------------------------------------------------- scorecard

  private showCard(name: string): void {
    this.state = 'card';
    this.cardReady = false;
    const last = this.card.length === HOLES.length;
    const summary = summarize(this.card, PARS);
    const layer = this.add.container(0, 0).setDepth(40);
    layer.add(this.add.rectangle(0, 0, WIDTH, HEIGHT, NEON.bg, 0.88).setOrigin(0));
    layer.add(neonText(this, WIDTH / 2, 140, last ? 'ROUND COMPLETE' : `HOLE ${this.holeIndex + 1}  ${name}`, 22, last ? NEON.yellow : NEON.green));
    const [holes, par, you] = scorecardLines(this.card, PARS);
    const row = (y: number, text: string, color: string) =>
      layer.add(hudText(this, WIDTH / 2, y, text, 14).setOrigin(0.5).setColor(color));
    row(230, holes, '#8a8ab8');
    row(264, par, '#8a8ab8');
    row(298, you, '#e8e8ff');
    layer.add(neonText(this, WIDTH / 2, 360, `TOTAL ${summary.total}   ${toPar(summary.diff)}`, 18, summary.diff <= 0 ? NEON.cyan : NEON.pink));
    const next = last ? 'FINISH' : 'NEXT HOLE';
    this.cardPrompt = blinkingPrompt(this, WIDTH / 2, 450, isTouchDevice() ? `TAP FOR ${next}` : `CLICK OR PRESS ${keyLabel('action', true)} FOR ${next}`, 14);
    layer.add(this.cardPrompt);
    this.cardLayer = layer;
    // A short wait so a shot's leftover input cannot skip the card.
    this.time.delayedCall(600, () => (this.cardReady = true));
  }

  private nextHole(): void {
    if (this.state !== 'card' || !this.cardReady) return;
    if (this.cardPrompt) this.tweens.killTweensOf(this.cardPrompt);
    this.cardLayer?.destroy(true);
    this.cardLayer = null;
    this.cardPrompt = null;
    if (this.card.length < HOLES.length) {
      this.startHole(this.holeIndex + 1);
      return;
    }
    this.state = 'done';
    const summary = summarize(this.card, PARS);
    endRun(this, {
      gameId: GAME_ID,
      score: roundScore(this.card),
      detail: `${summary.total} STROKES  PAR ${summary.par}  (${toPar(summary.diff)})`,
    });
  }

  // ---------------------------------------------------------------- render

  private updateHud(): void {
    const done = summarize(this.card, PARS);
    this.holeText.setText(`HOLE ${this.holeIndex + 1}/${HOLES.length}  PAR ${this.hole.par}`);
    this.nameText.setText(this.hole.name);
    this.strokeText.setText(`STROKES ${this.strokes}`);
    this.roundText.setText(this.card.length ? `ROUND ${toPar(done.diff)}` : 'ROUND E');
  }

  /** The course is drawn once per hole; only the ball, blockers and aim are redrawn each frame. */
  private drawCourse(): void {
    const g = this.courseGfx.clear();
    const pads = this.padGfx.clear();
    const { grid } = this.hole;
    const solid = (c: number, r: number) => isSolidTile(tileOf(grid, c, r));

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const ch = grid[r][c];
        const x = GRID_X + c * CELL;
        const y = GRID_Y + r * CELL;
        if (ch === ' ') continue;
        if (ch === '#') {
          g.fillStyle(0x140a26, 1).fillRect(x, y, CELL, CELL);
          continue;
        }
        g.fillStyle(0x06140e, 1).fillRect(x, y, CELL, CELL);
        g.lineStyle(1, NEON.green, 0.07).strokeRect(x, y, CELL, CELL);
        if (ch === 's') {
          g.fillStyle(NEON.yellow, 0.16).fillRect(x, y, CELL, CELL);
          g.fillStyle(NEON.yellow, 0.4);
          for (let i = 0; i < 5; i++) g.fillCircle(x + 6 + ((i * 13 + c * 7 + r * 5) % 28), y + 6 + ((i * 17 + r * 11) % 28), 1.5);
        } else if (ch === 'w') {
          g.fillStyle(NEON.blue, 0.3).fillRect(x, y, CELL, CELL);
          g.lineStyle(2, NEON.blue, 0.6);
          g.lineBetween(x + 6, y + 14, x + 18, y + 14).lineBetween(x + 22, y + 28, x + 34, y + 28);
        } else if (BOOST_DIRS[ch]) {
          const d = BOOST_DIRS[ch];
          pads.fillStyle(NEON.green, 0.14).fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
          pads.lineStyle(3, NEON.green, 0.9);
          // Two chevrons pointing along the pad.
          for (const off of [-7, 5]) {
            const tipX = x + CELL / 2 + d.x * (off + 6);
            const tipY = y + CELL / 2 + d.y * (off + 6);
            const backX = tipX - d.x * 8;
            const backY = tipY - d.y * 8;
            pads.lineBetween(backX - d.y * 8, backY - d.x * 8, tipX, tipY).lineBetween(tipX, tipY, backX + d.y * 8, backY + d.x * 8);
          }
        }
      }
    }

    // Neon rails wherever the green meets a wall: a wide faint pass for the glow, then the bright line.
    for (const [width, alpha] of [
      [8, 0.12],
      [2, 1],
    ]) {
      g.lineStyle(width, NEON.cyan, alpha);
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (solid(c, r)) continue;
          const x = GRID_X + c * CELL;
          const y = GRID_Y + r * CELL;
          if (solid(c, r - 1)) g.lineBetween(x, y, x + CELL, y);
          if (solid(c, r + 1)) g.lineBetween(x, y + CELL, x + CELL, y + CELL);
          if (solid(c - 1, r)) g.lineBetween(x, y, x, y + CELL);
          if (solid(c + 1, r)) g.lineBetween(x + CELL, y, x + CELL, y + CELL);
        }
      }
    }

    const tee = this.hole.tee;
    g.lineStyle(2, NEON.muted, 0.6).strokeRect(GRID_X + tee.x - 12, GRID_Y + tee.y - 12, 24, 24);
    const cx = GRID_X + this.hole.cup.x;
    const cy = GRID_Y + this.hole.cup.y;
    g.fillStyle(NEON.white, 0.08).fillCircle(cx, cy, CUP_RADIUS + 8);
    g.fillStyle(0x000000, 1).fillCircle(cx, cy, CUP_RADIUS);
    g.lineStyle(2, NEON.white, 0.9).strokeCircle(cx, cy, CUP_RADIUS);
    // The pin leans off the cup so it never hides the ball.
    g.lineStyle(2, NEON.white, 0.8).lineBetween(cx + 3, cy - 3, cx + 12, cy - 30);
    g.fillStyle(NEON.pink, 1).fillTriangle(cx + 12, cy - 30, cx + 28, cy - 25, cx + 11, cy - 20);
  }

  private render(): void {
    const g = this.gfx.clear();

    for (const m of this.hole.movers) {
      const r = moverRect(m, this.simTime, this.moverBox);
      g.fillStyle(NEON.pink, 0.25).fillRect(GRID_X + r.x - 3, GRID_Y + r.y - 3, r.w + 6, r.h + 6);
      g.fillStyle(0x2a0a1e, 1).fillRect(GRID_X + r.x, GRID_Y + r.y, r.w, r.h);
      g.lineStyle(2, NEON.pink, 1).strokeRect(GRID_X + r.x, GRID_Y + r.y, r.w, r.h);
    }

    const bx = GRID_X + this.ball.x;
    const by = GRID_Y + this.ball.y;
    if (this.ballVisible) {
      // The trail: recent positions, oldest faintest and smallest.
      this.trail[this.trailHead * 2] = bx;
      this.trail[this.trailHead * 2 + 1] = by;
      this.trailHead = (this.trailHead + 1) % TRAIL;
      this.trailLength = Math.min(TRAIL, this.trailLength + 1);
      for (let i = 0; i < this.trailLength; i++) {
        const k = (this.trailHead - this.trailLength + i + TRAIL) % TRAIL;
        const f = (i + 1) / this.trailLength;
        g.fillStyle(NEON.cyan, f * 0.35).fillCircle(this.trail[k * 2], this.trail[k * 2 + 1], BALL_RADIUS * (0.3 + 0.6 * f));
      }
    }

    if (this.state === 'aim') {
      const lineLength = 34 + this.power * 230;
      const cos = Math.cos(this.aimAngle);
      const sin = Math.sin(this.aimAngle);
      for (let d = 16; d < lineLength; d += 12) {
        g.fillStyle(NEON.yellow, 0.9 - (d / lineLength) * 0.6).fillCircle(bx + cos * d, by + sin * d, 2.5);
      }
      if (this.dragFrom) {
        // Where the pull started, so a touch player sees how far back they have dragged.
        const p = this.input.activePointer;
        g.lineStyle(1, NEON.white, 0.25).lineBetween(this.dragFrom.x, this.dragFrom.y, p.x, p.y);
      }
    }

    if (this.ballVisible) {
      const scale = 1 - this.sink.t * 0.6;
      g.fillStyle(NEON.white, 0.18 * scale).fillCircle(bx, by, (BALL_RADIUS + 6) * scale);
      g.fillStyle(NEON.white, 1).fillCircle(bx, by, BALL_RADIUS * scale);
    }

    const color = this.power < 0.5 ? NEON.green : this.power < 0.8 ? NEON.yellow : NEON.pink;
    g.fillStyle(0x1a1a33, 1).fillRect(METER.x, METER.y, METER.w, METER.h);
    if (this.power > 0) g.fillStyle(color, 1).fillRect(METER.x, METER.y, METER.w * this.power, METER.h);
    g.lineStyle(1, NEON.muted, 0.6).strokeRect(METER.x, METER.y, METER.w, METER.h);
  }
}
