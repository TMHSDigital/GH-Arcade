import Phaser from 'phaser';
import {
  BALL_R,
  BALL_SAVE_TIME,
  BALLS,
  BUMPER_KICK,
  FLIPPER_LEN,
  FLIPPER_R,
  FLIPPER_REST,
  FLIPPER_SPEED,
  FLIPPER_UP,
  GAME_ID,
  GRAVITY,
  HEIGHT,
  LAUNCH_MAX,
  LAUNCH_MIN,
  MAX_MULTIPLIER,
  MAX_SPEED,
  PLUNGE_CHARGE_TIME,
  POINTS_BANK,
  POINTS_BUMPER,
  POINTS_LANE,
  POINTS_LANES_DONE,
  POINTS_SLING,
  POINTS_STANDUP,
  POINTS_TARGET,
  SLING_KICK,
  SUBSTEPS,
  WIDTH,
} from '../config';
import {
  BUMPERS,
  FLIPPER_PIVOTS,
  LANE_INNER,
  LANE_X,
  LANES,
  PLUNGER_Y,
  POSTS,
  SLINGS,
  STANDUPS,
  TARGETS,
  WALLS,
  type Point,
  type Segment,
} from '../table';
import { unlock } from '../../../shared/achievements';
import { ArcadeControls } from '../../../shared/controls';
import { PauseController } from '../../../shared/pause';
import { noise, tone } from '../../../shared/sfx';
import { burstEmitter, floatText, NEON, PIXEL_FONT, showBanner } from '../../../shared/ui';

interface Flipper {
  pivot: Point;
  /** +1 for the left flipper, -1 for the right, which mirrors every angle. */
  side: 1 | -1;
  angle: number;
  omega: number;
  held: boolean;
}

interface Hit {
  nx: number;
  ny: number;
  /** Closing speed along the normal, before the bounce. */
  impact: number;
}

type BallState = 'ready' | 'live' | 'over';

export class GameScene extends Phaser.Scene {
  private ball = { x: LANE_X, y: PLUNGER_Y, vx: 0, vy: 0 };
  private state: BallState = 'ready';
  private charge = 0;
  private flippers: Flipper[] = [];
  private targetsUp: boolean[] = [];
  private lanesLit: boolean[] = [];
  /** Scene-clock time each element last lit up, for flashes and scoring cooldowns. */
  private flashAt = new Map<string, number>();

  private score = 0;
  private ballsLeft = BALLS;
  private multiplier = 1;
  private saveUntil = 0;
  private clock = 0;
  private touchSides = new Map<number, 1 | -1>();

  private walls!: Phaser.GameObjects.Graphics;
  private gfx!: Phaser.GameObjects.Graphics;
  private burst!: Phaser.GameObjects.Particles.ParticleEmitter;
  private scoreText!: Phaser.GameObjects.Text;
  private ballText!: Phaser.GameObjects.Text;
  private multText!: Phaser.GameObjects.Text;
  private controls!: ArcadeControls<'flipL' | 'flipR'>;
  private pause!: PauseController;

  constructor() {
    super('Game');
  }

  init(): void {
    this.score = 0;
    this.ballsLeft = BALLS;
    this.multiplier = 1;
    this.clock = 0;
    this.state = 'ready';
    this.charge = 0;
    this.flashAt = new Map();
    this.touchSides = new Map();
    this.targetsUp = TARGETS.map(() => true);
    this.lanesLit = LANES.map(() => false);
  }

  create(): void {
    this.cameras.main.fadeIn(250, 5, 5, 13);
    this.walls = this.add.graphics();
    this.gfx = this.add.graphics();
    this.burst = burstEmitter(this, 240, 450);
    this.drawTable();

    const label = { fontFamily: PIXEL_FONT, fontSize: '10px', color: '#8a8ab8' };
    const value = { fontFamily: PIXEL_FONT, fontSize: '18px', color: '#e8e8ff' };
    this.add.text(30, 80, 'SCORE', label);
    this.scoreText = this.add.text(30, 98, '0', value);
    this.add.text(30, 150, 'BALL', label);
    this.ballText = this.add.text(30, 168, '', value);
    this.add.text(30, 220, 'MULTIPLIER', label);
    this.multText = this.add.text(30, 238, '', { ...value, color: '#ffe45e' });
    const help = ['FLIPPERS', 'LEFT / RIGHT', 'A D / Z M', 'LB RB', '', 'LAUNCH', 'HOLD SPACE / DOWN', '', 'TOUCH', 'HOLD EACH SIDE'];
    this.add.text(WIDTH - 30, 80, help.join('\n'), { ...label, align: 'right', lineSpacing: 8 }).setOrigin(1, 0);

    this.flippers = FLIPPER_PIVOTS.map((pivot, i) => {
      const side = i === 0 ? 1 : -1;
      return { pivot, side, angle: this.flipperAngle(side, false), omega: 0, held: false } satisfies Flipper;
    });

    this.controls = new ArcadeControls(this, {
      // Z / M and the shoulder buttons and triggers work the flippers too.
      flipL: { keys: ['Z'], buttons: [4, 6] },
      flipR: { keys: ['M'], buttons: [5, 7] },
    });
    this.pause = new PauseController(this, this.controls, { canPause: () => this.state !== 'over' });
    this.bindTouch();
    this.readyBall();
  }

  /** Touch: holding the left half works the left flipper, the right half the right flipper (and the plunger). */
  private bindTouch(): void {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.touchSides.set(p.id, p.x < WIDTH / 2 ? 1 : -1));
    const release = (p: Phaser.Input.Pointer) => this.touchSides.delete(p.id);
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);
  }

  private flipperAngle(side: 1 | -1, up: boolean): number {
    const a = up ? FLIPPER_UP : FLIPPER_REST;
    return side === 1 ? a : Math.PI - a;
  }

  private readyBall(): void {
    this.state = 'ready';
    this.charge = 0;
    this.ball = { x: LANE_X, y: PLUNGER_Y, vx: 0, vy: 0 };
    this.updateHud();
  }

  private updateHud(): void {
    this.scoreText.setText(this.score.toLocaleString());
    this.ballText.setText(`${Math.min(BALLS - this.ballsLeft + 1, BALLS)} / ${BALLS}`);
    this.multText.setText(`x${this.multiplier}`);
  }

  // ---------------------------------------------------------------- loop

  update(_time: number, deltaMs: number): void {
    if (this.pause.isPaused) return;
    const dt = Math.min(deltaMs, 40) / 1000;
    this.clock += dt * 1000;
    this.readInput(dt);
    if (this.state !== 'over') {
      const h = dt / SUBSTEPS;
      for (let i = 0; i < SUBSTEPS; i++) this.step(h);
      this.checkBallOut();
    }
    this.render();
  }

  private readInput(dt: number): void {
    const c = this.controls;
    const touch = [...this.touchSides.values()];
    const leftHeld = c.isDown('left') || c.isDown('flipL') || touch.includes(1);
    const rightHeld = c.isDown('right') || c.isDown('flipR') || touch.includes(-1);
    this.flippers.forEach((f, i) => {
      const held = i === 0 ? leftHeld : rightHeld;
      if (held && !f.held) tone({ freq: 180, duration: 0.04, type: 'square', volume: 0.05 });
      f.held = held;
    });

    if (this.state !== 'ready') return;
    const plunging = c.isDown('action') || c.isDown('down') || touch.includes(-1);
    if (plunging) {
      this.charge = Math.min(1, this.charge + dt / PLUNGE_CHARGE_TIME);
    } else if (this.charge > 0) {
      this.launch();
    }
    this.ball.y = PLUNGER_Y + this.charge * 16;
  }

  private launch(): void {
    this.state = 'live';
    this.ball.vy = -(LAUNCH_MIN + (LAUNCH_MAX - LAUNCH_MIN) * this.charge);
    this.ball.y = PLUNGER_Y;
    this.charge = 0;
    if (this.saveUntil >= 0) this.saveUntil = this.clock + BALL_SAVE_TIME * 1000;
    noise(0.12, 0.06);
    tone({ freq: 120, toFreq: 480, duration: 0.15, type: 'sawtooth', volume: 0.05 });
  }

  // ---------------------------------------------------------------- physics

  private step(h: number): void {
    for (const f of this.flippers) {
      const target = this.flipperAngle(f.side, f.held);
      const delta = Phaser.Math.Clamp(target - f.angle, -FLIPPER_SPEED * h, FLIPPER_SPEED * h);
      f.angle += delta;
      f.omega = delta / h;
    }
    if (this.state !== 'live') return;

    const b = this.ball;
    b.vy += GRAVITY * h;
    b.x += b.vx * h;
    b.y += b.vy * h;

    for (const w of WALLS) this.collideSegment(w, 0, 0.45);
    SLINGS.forEach((s, i) => {
      const hit = this.collideSegment(s, 0, 0.5);
      if (hit && hit.impact > 120) this.kick(hit, SLING_KICK, `sling${i}`, POINTS_SLING, NEON.pink);
    });
    TARGETS.forEach((t, i) => {
      if (!this.targetsUp[i]) return;
      if (this.collideSegment(t, 3, 0.4)) this.hitTarget(i);
    });
    STANDUPS.forEach((s, i) => {
      const hit = this.collideSegment(s, 3, 0.4);
      if (hit && hit.impact > 60) this.award(`standup${i}`, POINTS_STANDUP, NEON.green, 250);
    });
    for (const p of POSTS) this.collideCircle(p, p.r, 0.5);
    BUMPERS.forEach((bm, i) => {
      const hit = this.collideCircle(bm, bm.r, 0.6);
      if (hit) this.kick(hit, BUMPER_KICK, `bumper${i}`, POINTS_BUMPER, NEON.cyan);
    });
    for (const f of this.flippers) this.collideFlipper(f);
    LANES.forEach((l, i) => {
      if (!this.lanesLit[i] && Math.hypot(b.x - l.x, b.y - l.y) < l.r + BALL_R) this.lightLane(i);
    });

    const speed = Math.hypot(b.vx, b.vy);
    if (speed > MAX_SPEED) {
      b.vx *= MAX_SPEED / speed;
      b.vy *= MAX_SPEED / speed;
    }
  }

  /**
   * Resolves the ball against a thick segment moving with `surface` velocity at the contact point.
   * Returns the contact normal and closing speed when they touched while approaching.
   */
  private collideSegment(s: Segment, thick: number, bounce: number, surface?: (x: number, y: number) => Point): Hit | null {
    const b = this.ball;
    const abx = s.b.x - s.a.x;
    const aby = s.b.y - s.a.y;
    const t = Phaser.Math.Clamp(((b.x - s.a.x) * abx + (b.y - s.a.y) * aby) / (abx * abx + aby * aby), 0, 1);
    const px = s.a.x + abx * t;
    const py = s.a.y + aby * t;
    return this.resolve(px, py, BALL_R + thick, bounce, surface?.(px, py));
  }

  private collideCircle(c: Point, r: number, bounce: number): Hit | null {
    return this.resolve(c.x, c.y, BALL_R + r, bounce);
  }

  private resolve(px: number, py: number, minDist: number, bounce: number, surface?: Point): Hit | null {
    const b = this.ball;
    const dx = b.x - px;
    const dy = b.y - py;
    const d2 = dx * dx + dy * dy;
    if (d2 >= minDist * minDist) return null;
    const d = Math.sqrt(d2) || 0.0001;
    const nx = dx / d;
    const ny = dy / d;
    b.x = px + nx * minDist;
    b.y = py + ny * minDist;
    const sx = surface?.x ?? 0;
    const sy = surface?.y ?? 0;
    let rvx = b.vx - sx;
    let rvy = b.vy - sy;
    const vn = rvx * nx + rvy * ny;
    if (vn >= 0) return null;
    // Soft contacts don't bounce, so a ball resting on a flipper settles instead of jittering.
    if (vn > -60) bounce = 0;
    rvx -= (1 + bounce) * vn * nx;
    rvy -= (1 + bounce) * vn * ny;
    b.vx = rvx + sx;
    b.vy = rvy + sy;
    return { nx, ny, impact: -vn };
  }

  private collideFlipper(f: Flipper): void {
    const tip = { x: f.pivot.x + Math.cos(f.angle) * FLIPPER_LEN, y: f.pivot.y + Math.sin(f.angle) * FLIPPER_LEN };
    // A point on a turning flipper moves at omega x r.
    this.collideSegment({ a: f.pivot, b: tip }, FLIPPER_R, 0.3, (x, y) => ({ x: -f.omega * (y - f.pivot.y), y: f.omega * (x - f.pivot.x) }));
  }

  private checkBallOut(): void {
    const b = this.ball;
    if (this.state !== 'live') return;
    // Fell back down the launch lane: set it on the plunger again.
    if (b.x > LANE_INNER && b.y > PLUNGER_Y && b.vy >= 0) {
      this.readyBall();
      return;
    }
    if (b.y < HEIGHT + 20) return;
    if (this.clock < this.saveUntil) {
      this.saveUntil = -1;
      showBanner(this, 'BALL SAVED', NEON.green, HEIGHT / 2);
      this.readyBall();
      return;
    }
    this.drain();
  }

  // ---------------------------------------------------------------- scoring

  private award(key: string, points: number, color: number, cooldownMs = 80): boolean {
    const last = this.flashAt.get(key) ?? -Infinity;
    if (this.clock - last < cooldownMs) return false;
    this.flashAt.set(key, this.clock);
    this.addScore(points);
    this.burst.setParticleTint(color);
    this.burst.explode(8, this.ball.x, this.ball.y);
    return true;
  }

  private kick(hit: Hit, strength: number, key: string, points: number, color: number): void {
    const b = this.ball;
    // Make sure the ball leaves at least this fast along the normal.
    const vn = b.vx * hit.nx + b.vy * hit.ny;
    if (vn < strength) {
      b.vx += hit.nx * (strength - vn);
      b.vy += hit.ny * (strength - vn);
    }
    if (this.award(key, points, color)) tone({ freq: key.startsWith('bumper') ? 660 : 440, duration: 0.06, type: 'square', volume: 0.06 });
  }

  private hitTarget(i: number): void {
    this.targetsUp[i] = false;
    this.award(`target${i}`, POINTS_TARGET, NEON.orange, 0);
    tone({ freq: 520, duration: 0.08, type: 'triangle', volume: 0.07 });
    if (this.targetsUp.some(Boolean)) return;
    unlock('pinball.bank');
    this.addScore(POINTS_BANK);
    showBanner(this, `BANK CLEARED\n+${POINTS_BANK * this.multiplier}`, NEON.orange, HEIGHT / 2);
    this.time.delayedCall(1200, () => (this.targetsUp = TARGETS.map(() => true)));
  }

  private lightLane(i: number): void {
    this.lanesLit[i] = true;
    this.flashAt.set(`lane${i}`, this.clock);
    this.addScore(POINTS_LANE);
    tone({ freq: 880, duration: 0.07, type: 'triangle', volume: 0.06 });
    if (!this.lanesLit.every(Boolean)) return;
    unlock('pinball.lanes');
    this.addScore(POINTS_LANES_DONE);
    this.lanesLit = LANES.map(() => false);
    if (this.multiplier < MAX_MULTIPLIER) {
      this.multiplier++;
      if (this.multiplier === MAX_MULTIPLIER) unlock('pinball.multi');
      showBanner(this, `MULTIPLIER x${this.multiplier}`, NEON.yellow, HEIGHT / 2);
    }
    [660, 880, 1100].forEach((f, n) => this.time.delayedCall(n * 90, () => tone({ freq: f, duration: 0.1, type: 'triangle', volume: 0.07 })));
    this.updateHud();
  }

  private addScore(points: number): void {
    const gained = points * this.multiplier;
    this.score += gained;
    if (this.score >= 50000) unlock('pinball.score');
    if (gained >= 1000) floatText(this, this.ball.x, this.ball.y - 20, `+${gained}`, NEON.yellow, 12);
    this.updateHud();
  }

  private drain(): void {
    this.ballsLeft--;
    noise(0.3, 0.08);
    tone({ freq: 400, toFreq: 90, duration: 0.5, type: 'sawtooth', volume: 0.07 });
    this.cameras.main.shake(180, 0.006);
    if (this.ballsLeft > 0) {
      this.saveUntil = 0;
      showBanner(this, `BALL ${BALLS - this.ballsLeft + 1}`, NEON.cyan, HEIGHT / 2);
      this.readyBall();
      return;
    }
    this.state = 'over';
    this.time.delayedCall(900, () =>
      this.scene.start('GameOver', { gameId: GAME_ID, score: this.score, detail: `MULTIPLIER x${this.multiplier}` }),
    );
  }

  // ---------------------------------------------------------------- render

  private drawTable(): void {
    const g = this.walls.clear();
    g.fillStyle(NEON.purple, 0.05).fillRect(200, 0, 390, HEIGHT);
    for (const [width, alpha] of [[8, 0.15], [2.5, 1]] as const) {
      g.lineStyle(width, NEON.purple, alpha);
      for (const w of WALLS) g.lineBetween(w.a.x, w.a.y, w.b.x, w.b.y);
    }
    // Arrows guiding the eye up the lanes.
    g.fillStyle(NEON.white, 0.08);
    for (let y = 140; y < 420; y += 50) g.fillTriangle(380, y, 372, y + 14, 388, y + 14);
  }

  private flash(key: string, ms = 160): number {
    const at = this.flashAt.get(key);
    if (at === undefined) return 0;
    return Math.max(0, 1 - (this.clock - at) / ms);
  }

  private render(): void {
    const g = this.gfx.clear();

    SLINGS.forEach((s, i) => {
      const f = this.flash(`sling${i}`);
      g.lineStyle(4 + f * 4, f > 0 ? NEON.white : NEON.pink, 1).lineBetween(s.a.x, s.a.y, s.b.x, s.b.y);
    });

    BUMPERS.forEach((bm, i) => {
      const f = this.flash(`bumper${i}`);
      g.fillStyle(NEON.cyan, 0.15 + f * 0.5).fillCircle(bm.x, bm.y, bm.r + 4 + f * 4);
      g.lineStyle(3, f > 0 ? NEON.white : NEON.cyan, 1).strokeCircle(bm.x, bm.y, bm.r);
      g.fillStyle(NEON.cyan, 0.6 + f * 0.4).fillCircle(bm.x, bm.y, bm.r * 0.45);
    });

    for (const p of POSTS) g.fillStyle(NEON.purple, 1).fillCircle(p.x, p.y, p.r);

    LANES.forEach((l, i) => {
      const lit = this.lanesLit[i];
      g.lineStyle(2, NEON.yellow, lit ? 1 : 0.35).strokeCircle(l.x, l.y, 7);
      if (lit) g.fillStyle(NEON.yellow, 1).fillCircle(l.x, l.y, 5);
    });

    TARGETS.forEach((t, i) => {
      if (this.targetsUp[i]) g.lineStyle(6, NEON.orange, 1).lineBetween(t.a.x, t.a.y, t.b.x, t.b.y);
      else g.lineStyle(2, NEON.orange, 0.25).lineBetween(t.a.x - 3, t.a.y, t.b.x - 3, t.b.y);
    });
    STANDUPS.forEach((s, i) => {
      const f = this.flash(`standup${i}`, 300);
      g.lineStyle(6, f > 0 ? NEON.white : NEON.green, 1).lineBetween(s.a.x, s.a.y, s.b.x, s.b.y);
    });

    for (const f of this.flippers) {
      const tx = f.pivot.x + Math.cos(f.angle) * FLIPPER_LEN;
      const ty = f.pivot.y + Math.sin(f.angle) * FLIPPER_LEN;
      g.lineStyle(FLIPPER_R * 2 + 8, NEON.yellow, 0.15).lineBetween(f.pivot.x, f.pivot.y, tx, ty);
      g.lineStyle(FLIPPER_R * 2, NEON.yellow, 1).lineBetween(f.pivot.x, f.pivot.y, tx, ty);
      g.fillStyle(NEON.yellow, 1).fillCircle(f.pivot.x, f.pivot.y, FLIPPER_R).fillCircle(tx, ty, FLIPPER_R);
      g.fillStyle(NEON.bg, 1).fillCircle(f.pivot.x, f.pivot.y, 3);
    }

    // Plunger spring and charge meter.
    const springTop = PLUNGER_Y + BALL_R + this.charge * 16;
    g.fillStyle(NEON.pink, 0.8).fillRect(LANE_X - 8, springTop, 16, 6);
    for (let y = springTop + 10; y < HEIGHT; y += 6) g.lineStyle(2, NEON.pink, 0.5).lineBetween(LANE_X - 6, y, LANE_X + 6, y);
    if (this.state === 'ready') {
      g.fillStyle(NEON.white, 0.15).fillRect(600, 420, 10, 150);
      g.fillStyle(this.charge >= 1 ? NEON.green : NEON.pink, 1).fillRect(600, 570 - 150 * this.charge, 10, 150 * this.charge);
    }

    // Ball save light.
    if (this.state === 'live' && this.clock < this.saveUntil) {
      const on = this.saveUntil - this.clock > 2000 || Math.floor(this.clock / 150) % 2 === 0;
      if (on) g.fillStyle(NEON.green, 0.9).fillTriangle(380, 580, 372, 594, 388, 594);
    }

    if (this.state !== 'over') {
      const b = this.ball;
      g.fillStyle(NEON.white, 0.2).fillCircle(b.x, b.y, BALL_R + 5);
      g.fillStyle(NEON.white, 1).fillCircle(b.x, b.y, BALL_R);
      g.fillStyle(NEON.cyan, 0.8).fillCircle(b.x - 3, b.y - 3, 2.5);
    }
  }
}
