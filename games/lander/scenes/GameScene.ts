import Phaser from 'phaser';
import { GAME_ID, HEIGHT, LANDED_PAUSE_MS, RESPAWN_MS, START_LIVES, WIDTH } from '../config';
import {
  altitude,
  buildStage,
  type CrashReason,
  groundYAt,
  type Lander,
  landingChecks,
  landingPoints,
  restOnPad,
  type Stage,
  stepLander,
  touchdown,
} from '../rules';
import { trophiesFor } from '../../../shared/achievements';
import { ArcadeControls } from '../../../shared/controls';
import { frameSeconds } from '../../../shared/frame';
import { PauseController } from '../../../shared/pause';
import { dailyOutcome, type DailyRun, dailyRunFrom, diceFor } from '../../../shared/rng';
import { endRun, SCENE } from '../../../shared/scenes';
import { noise, tone } from '../../../shared/sfx';
import { isTouchDevice, VirtualButton, VirtualStick } from '../../../shared/touch';
import {
  burstEmitter,
  dailyHudLabel,
  floatText,
  hex,
  HUD_LABEL_STYLE,
  HUD_STYLE,
  impact,
  NEON,
  neonText,
  reducedMotion,
  showBanner,
} from '../../../shared/ui';
import type { TROPHIES } from '../trophies';

const { reach, unlock } = trophiesFor<typeof TROPHIES>();

type State = 'flying' | 'landed' | 'crashed' | 'over';

/** A spark of engine exhaust or a broken hull segment drifting away. */
interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  /** Debris only: the segment's angle, spin and length. */
  angle: number;
  spin: number;
  len: number;
}

const MAX_FLAME = 140;
/** Below this altitude the HUD calls out what would go wrong on touchdown. */
const CALLOUT_ALT = 170;
const GREEN = hex(NEON.green);
const PINK = hex(NEON.pink);
const MUTED: string = HUD_LABEL_STYLE.color;

/** Drops every bit whose life has run out, in place (no new array each frame). */
function age(bits: Bit[], dt: number, gravity: number): void {
  let n = 0;
  for (const b of bits) {
    b.life -= dt;
    if (b.life <= 0) continue;
    b.vy += gravity * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.angle += b.spin * dt;
    bits[n++] = b;
  }
  bits.length = n;
}

export class GameScene extends Phaser.Scene {
  /** The daily challenge being played, or null in a normal game. */
  private daily: DailyRun | null = null;
  private dice = diceFor(null);

  private stageNo = 1;
  private stageData!: Stage;
  private lander: Lander = { x: 0, y: 0, vx: 0, vy: 0, angle: 0 };
  private fuel = 0;
  private lives = START_LIVES;
  private score = 0;
  private landings = 0;
  private state: State = 'flying';
  private thrusting = false;
  private elapsed = 0;
  private engineSound = 0;
  private warnSound = 0;
  private dryWarned = false;
  private flame: Bit[] = [];
  private debris: Bit[] = [];

  private terrainGfx!: Phaser.GameObjects.Graphics;
  private gfx!: Phaser.GameObjects.Graphics;
  private burst!: Phaser.GameObjects.Particles.ParticleEmitter;
  private scoreText!: Phaser.GameObjects.Text;
  private stageText!: Phaser.GameObjects.Text;
  private windText!: Phaser.GameObjects.Text;
  private readouts!: { h: Phaser.GameObjects.Text; v: Phaser.GameObjects.Text; tilt: Phaser.GameObjects.Text; alt: Phaser.GameObjects.Text; call: Phaser.GameObjects.Text };
  /** Top of the left HUD block: lower in a daily, under the daily label. */
  private hudTop = 12;
  private controls!: ArcadeControls;
  private pause!: PauseController;

  constructor() {
    super(SCENE.game);
  }

  init(data: { daily?: boolean } = {}): void {
    // Daily challenge: each stage's terrain, pad and wind are seeded from the date, so everyone
    // flies the same stages today. Exhaust and debris stay random; they are scenery.
    this.daily = dailyRunFrom(data, GAME_ID);
    this.dice = diceFor(this.daily);
    this.stageNo = 1;
    this.lives = START_LIVES;
    this.score = 0;
    this.landings = 0;
    this.state = 'flying';
    this.thrusting = false;
    this.elapsed = 0;
    this.flame = [];
    this.debris = [];
  }

  create(): void {
    this.cameras.main.fadeIn(250, 5, 5, 13);
    this.drawStars();
    this.terrainGfx = this.add.graphics();
    this.gfx = this.add.graphics();
    this.burst = burstEmitter(this, 240, 800);

    this.scoreText = this.add.text(WIDTH / 2, 24, '0', HUD_STYLE).setOrigin(0.5).setDepth(100);
    this.stageText = this.add.text(WIDTH - 20, 24, '', { ...HUD_STYLE, fontSize: '12px' }).setOrigin(1, 0.5).setDepth(100);
    this.windText = this.add.text(WIDTH - 20, 78, '', { ...HUD_LABEL_STYLE, color: hex(NEON.yellow) }).setOrigin(1, 0.5).setDepth(100);
    if (this.daily) dailyHudLabel(this, 20, 10, GAME_ID, this.daily, { depth: 100 });
    this.hudTop = this.daily ? 52 : 12;
    const label = (x: number, y: number) => this.add.text(x, y, '', HUD_LABEL_STYLE).setDepth(100);
    const row = this.hudTop + 22;
    this.add.text(20, this.hudTop, 'FUEL', HUD_LABEL_STYLE).setDepth(100);
    this.readouts = {
      h: label(20, row),
      v: label(100, row),
      tilt: label(180, row),
      alt: label(20, row + 18),
      call: label(20, row + 36),
    };

    this.controls = new ArcadeControls(this);
    this.pause = new PauseController(this, this.controls, { canPause: () => this.state !== 'over' });

    if (isTouchDevice()) {
      const stick = new VirtualStick(this, new Phaser.Geom.Rectangle(0, HEIGHT * 0.35, WIDTH * 0.5, HEIGHT * 0.65), 58);
      this.controls.setStick(() => stick.value);
      const thrust = new VirtualButton(this, WIDTH - 85, HEIGHT - 95, 'THRUST', NEON.orange, 46);
      this.controls.addVirtual('action', () => thrust.isDown);
    }

    this.startStage(1);
  }

  private drawStars(): void {
    const g = this.add.graphics().setDepth(-10);
    for (let i = 0; i < 90; i++) {
      g.fillStyle(0xffffff, Phaser.Math.FloatBetween(0.1, 0.5));
      g.fillCircle(Phaser.Math.Between(0, WIDTH), Phaser.Math.Between(0, HEIGHT * 0.7), Phaser.Math.FloatBetween(0.5, 1.4));
    }
  }

  // ---------------------------------------------------------------- stages

  private startStage(n: number): void {
    this.stageNo = n;
    reach('lander.stage5', n);
    // Each stage has its own sequence, so a stage looks the same however the earlier ones went.
    this.stageData = buildStage(n, this.dice(`stage:${n}`).next);
    this.drawTerrain();
    this.stageText.setText(`STAGE ${n}`);
    const wind = this.stageData.wind;
    const arrows = wind === 0 ? '' : (wind > 0 ? '>' : '<').repeat(Math.min(3, Math.ceil(Math.abs(wind) / 6)));
    this.windText.setText(wind === 0 ? '' : `WIND ${arrows}`);
    showBanner(this, wind === 0 ? `STAGE ${n}` : `STAGE ${n}\nWIND ${wind > 0 ? 'EAST' : 'WEST'}`, NEON.cyan, HEIGHT / 2 - 60);
    this.startAttempt();
  }

  /** A fresh attempt at the current stage: back at the spawn point with a full tank. */
  private startAttempt(): void {
    this.lander = { ...this.stageData.spawn };
    this.fuel = this.stageData.fuel;
    this.state = 'flying';
    this.thrusting = false;
    this.dryWarned = false;
  }

  // ---------------------------------------------------------------- loop

  update(_time: number, deltaMs: number): void {
    if (this.pause.isPaused) return;
    const dt = frameSeconds(deltaMs);
    this.elapsed += dt * 1000;
    if (this.state === 'flying') this.fly(dt);
    else this.thrusting = false;
    age(this.flame, dt, 0);
    age(this.debris, dt, this.stageData.gravity * 0.5);
    this.settleFlame();
    this.render();
    this.updateHud();
  }

  private fly(dt: number): void {
    const c = this.controls;
    const wantsThrust = c.isDown('up') || c.isDown('action') || c.axisY < -0.5;
    const step = stepLander(this.lander, { turn: c.axisX, thrust: wantsThrust }, this.stageData, this.fuel, dt);
    this.lander = step.lander;
    this.fuel = step.fuel;
    this.thrusting = step.thrusting;

    if (this.thrusting) {
      this.emitFlame(dt);
      this.engineSound -= dt * 1000;
      if (this.engineSound <= 0) {
        noise(0.09, 0.03);
        this.engineSound = 85;
      }
    } else if (wantsThrust && this.fuel <= 0 && !this.dryWarned) {
      this.dryWarned = true;
      tone({ freq: 220, toFreq: 110, duration: 0.25, type: 'square', volume: 0.06 });
      floatText(this, this.lander.x, this.lander.y - 30, 'OUT OF FUEL', NEON.pink, 10);
    }
    // Low fuel: a short beep that speeds up as the tank empties.
    if (this.fuel > 0 && this.fuel < this.stageData.fuel * 0.2) {
      this.warnSound -= dt * 1000;
      if (this.warnSound <= 0) {
        tone({ freq: 990, duration: 0.05, type: 'triangle', volume: 0.04 });
        this.warnSound = 250 + (this.fuel / (this.stageData.fuel * 0.2)) * 450;
      }
    }

    const outcome = touchdown(this.lander, this.stageData.ground, this.stageData.pad);
    if (outcome.kind === 'landed') this.land();
    else if (outcome.kind === 'crashed') this.crash(outcome.reason);
  }

  private emitFlame(dt: number): void {
    const l = this.lander;
    const s = Math.sin(l.angle);
    const c = Math.cos(l.angle);
    // Exhaust leaves the nozzle (below the hull) heading away from the nose.
    const nx = l.x - 9 * s;
    const ny = l.y + 9 * c;
    const count = Math.max(1, Math.round(dt * 110));
    for (let i = 0; i < count && this.flame.length < MAX_FLAME; i++) {
      const speed = Phaser.Math.FloatBetween(110, 190);
      const spread = Phaser.Math.FloatBetween(-35, 35);
      const life = Phaser.Math.FloatBetween(0.2, 0.42);
      this.flame.push({
        x: nx,
        y: ny,
        vx: l.vx - s * speed + c * spread,
        vy: l.vy + c * speed + s * spread,
        life,
        max: life,
        angle: 0,
        spin: 0,
        len: 0,
      });
    }
  }

  /**
   * Exhaust that reaches the ground splashes sideways and slows, like dust kicked up. Debris that
   * lands skids to a stop on the surface.
   */
  private settleFlame(): void {
    const ground = this.stageData.ground;
    for (const b of this.flame) {
      const gy = groundYAt(ground, b.x);
      if (b.y > gy) {
        b.y = gy;
        b.vy = -Math.abs(b.vy) * 0.15;
        b.vx *= 1.3;
      }
    }
    for (const d of this.debris) {
      const gy = groundYAt(ground, d.x);
      if (d.y > gy) {
        d.y = gy;
        d.vy = 0;
        d.vx *= 0.8;
        d.spin *= 0.8;
      }
    }
  }

  // ---------------------------------------------------------------- outcomes

  private land(): void {
    this.state = 'landed';
    this.thrusting = false;
    const touchSpeed = this.lander.vy;
    const pts = landingPoints(this.stageNo, this.stageData.padWidth, this.fuel, touchSpeed);
    this.lander = restOnPad(this.lander, this.stageData.pad);
    this.landings++;
    this.addScore(pts.total);
    unlock('lander.touchdown');
    if (pts.soft) unlock('lander.feather');

    const { x, y } = this.lander;
    this.burst.setParticleTint(NEON.green);
    this.burst.explode(22, x, y + 12);
    floatText(this, x, y - 34, `+${pts.total}`, NEON.green, 14);
    showBanner(this, pts.soft ? 'FEATHER LANDING' : 'TOUCHDOWN', NEON.green, HEIGHT / 2 - 60);
    [523, 659, 784, 1047].forEach((f, i) => this.time.delayedCall(i * 90, () => tone({ freq: f, duration: 0.12, type: 'triangle', volume: 0.08 })));

    // The points, line by line, while the lander sits on the pad.
    const lines = [`LANDING  ${pts.base}`, `PAD      +${pts.pad}`, `FUEL     +${pts.fuel}`];
    if (pts.soft) lines.push(`SOFT     +${pts.soft}`);
    const sheet = neonText(this, WIDTH / 2, HEIGHT / 2 + 10, lines.join('\n'), 12, NEON.white).setDepth(40).setLineSpacing(8);

    this.time.delayedCall(LANDED_PAUSE_MS, () => {
      sheet.destroy();
      this.startStage(this.stageNo + 1);
    });
  }

  private crash(reason: CrashReason): void {
    this.state = 'crashed';
    this.thrusting = false;
    this.lives--;
    const l = this.lander;
    this.burst.setParticleTint(NEON.orange);
    this.burst.explode(40, l.x, l.y);
    this.burst.setParticleTint(NEON.pink);
    this.burst.explode(20, l.x, l.y);
    // The hull breaks into line segments that tumble and fall.
    for (let i = 0; i < 7; i++) {
      const a = Phaser.Math.FloatBetween(Math.PI * 1.1, Math.PI * 1.9);
      const v = Phaser.Math.FloatBetween(50, 130);
      this.debris.push({
        x: l.x,
        y: l.y,
        vx: l.vx * 0.3 + Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: 1.8,
        max: 1.8,
        angle: a,
        spin: Phaser.Math.FloatBetween(-6, 6),
        len: Phaser.Math.Between(6, 14),
      });
    }
    floatText(this, l.x, l.y - 30, reason, NEON.pink, 12);
    impact(this, this.controls, 320, 0.012);
    if (!reducedMotion()) this.cameras.main.flash(160, 255, 120, 60);
    noise(0.6, 0.14);
    tone({ freq: 260, toFreq: 40, duration: 0.7, type: 'sawtooth', volume: 0.08 });

    if (this.lives <= 0) {
      this.state = 'over';
      const detail = `REACHED STAGE ${this.stageNo}   ${this.landings} LANDING${this.landings === 1 ? '' : 'S'}`;
      endRun(this, { gameId: GAME_ID, score: this.score, detail, ...dailyOutcome(this.daily) }, 1800);
      return;
    }
    this.time.delayedCall(RESPAWN_MS, () => this.startAttempt());
  }

  private addScore(points: number): void {
    this.score += points;
    reach('lander.score', this.score);
    this.scoreText.setText(this.score.toLocaleString());
  }

  // ---------------------------------------------------------------- render

  /** Neon line: a wide faint stroke for glow, then a thin bright one. */
  private neonPath(g: Phaser.GameObjects.Graphics, points: { x: number; y: number }[], color: number, closed = true, alpha = 1): void {
    for (const [w, a] of [[7, 0.14], [2, 1]] as const) {
      g.lineStyle(w, color, a * alpha).beginPath();
      g.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
      if (closed) g.closePath();
      g.strokePath();
    }
  }

  /** The ground and pad change only between stages, so they are drawn once per stage. */
  private drawTerrain(): void {
    const g = this.terrainGfx.clear();
    const { ground, pad } = this.stageData;
    g.fillStyle(NEON.purple, 0.1).beginPath().moveTo(0, HEIGHT);
    for (const p of ground) g.lineTo(p.x, p.y);
    g.lineTo(WIDTH, HEIGHT).closePath().fillPath();
    this.neonPath(g, ground, NEON.purple, false);
    // The pad: a bright bar with a glow, and short struts down into the ground.
    g.fillStyle(NEON.green, 0.18).fillRect(pad.x1 - 4, pad.y - 6, pad.x2 - pad.x1 + 8, 12);
    g.lineStyle(4, NEON.green, 1).lineBetween(pad.x1, pad.y, pad.x2, pad.y);
    g.lineStyle(2, NEON.green, 0.5).lineBetween(pad.x1 + 6, pad.y, pad.x1 + 6, pad.y + 14).lineBetween(pad.x2 - 6, pad.y, pad.x2 - 6, pad.y + 14);
  }

  private render(): void {
    const g = this.gfx.clear();
    const { pad, wind } = this.stageData;

    // Wind streaks drifting across the sky.
    if (wind !== 0 && !reducedMotion()) {
      g.lineStyle(1, NEON.yellow, 0.18);
      const drift = (this.elapsed / 1000) * wind * 9;
      for (let i = 0; i < 14; i++) {
        const x = (((i * 173 + drift) % (WIDTH + 60)) + WIDTH + 60) % (WIDTH + 60) - 30;
        const y = 110 + ((i * 89) % 220);
        g.lineBetween(x, y, x + 24, y);
      }
    }

    // Pad lights blink while the stage is in play and stay lit after a landing.
    if (this.state === 'landed' || reducedMotion() || Math.floor(this.elapsed / 350) % 2 === 0) {
      g.fillStyle(NEON.green, 1).fillCircle(pad.x1, pad.y - 4, 3).fillCircle(pad.x2, pad.y - 4, 3);
    }

    for (const b of this.flame) {
      const t = b.life / b.max;
      g.fillStyle(t > 0.6 ? NEON.yellow : NEON.orange, t * 0.9).fillCircle(b.x, b.y, 1 + t * 2.6);
    }

    for (const d of this.debris) {
      const dx = (Math.cos(d.angle) * d.len) / 2;
      const dy = (Math.sin(d.angle) * d.len) / 2;
      this.neonPath(g, [{ x: d.x - dx, y: d.y - dy }, { x: d.x + dx, y: d.y + dy }], NEON.cyan, false, Math.min(d.life, 1));
    }

    if (this.state === 'flying' || this.state === 'landed') {
      const l = this.lander;
      // The legs show the landing check: green when a touchdown now would hold, pink when it would not.
      let legs: number = NEON.cyan;
      if (this.state === 'landed') legs = NEON.green;
      else if (altitude(l, this.stageData.ground) < CALLOUT_ALT) legs = landingChecks(l).safe ? NEON.green : NEON.pink;
      this.drawLander(g, l.x, l.y, l.angle, 1, legs);
    }

    // Fuel gauge.
    const top = this.hudTop;
    const frac = Phaser.Math.Clamp(this.fuel / this.stageData.fuel, 0, 1);
    g.fillStyle(0x1a1a33, 1).fillRect(70, top, 130, 10);
    g.fillStyle(frac > 0.2 ? NEON.cyan : NEON.pink, 1).fillRect(70, top, 130 * frac, 10);
    g.lineStyle(1, NEON.cyan, 0.5).strokeRect(70, top, 130, 10);

    // Spare landers under the stage counter.
    for (let i = 0; i < Math.min(this.lives, 6); i++) this.drawLander(g, WIDTH - 28 - i * 26, 52, 0, 0.6, NEON.cyan);
  }

  private drawLander(g: Phaser.GameObjects.Graphics, x: number, y: number, angle: number, scale: number, legs: number): void {
    const c = Math.cos(angle) * scale;
    const s = Math.sin(angle) * scale;
    const p = (lx: number, ly: number) => ({ x: x + lx * c - ly * s, y: y + lx * s + ly * c });
    this.neonPath(g, [p(0, -14), p(8, -9), p(9, -1), p(6, 5), p(-6, 5), p(-9, -1), p(-8, -9)], NEON.cyan);
    this.neonPath(g, [p(-3, 5), p(-5, 9), p(5, 9), p(3, 5)], NEON.cyan, false, 0.8);
    this.neonPath(g, [p(-6, 4), p(-12, 12)], legs, false);
    this.neonPath(g, [p(6, 4), p(12, 12)], legs, false);
    this.neonPath(g, [p(-15, 12), p(-9, 12)], legs, false);
    this.neonPath(g, [p(9, 12), p(15, 12)], legs, false);
    const w = p(0, -6);
    g.fillStyle(NEON.cyan, 0.8).fillCircle(w.x, w.y, 2.6 * scale);
  }

  private updateHud(): void {
    const r = this.readouts;
    const l = this.lander;
    const flying = this.state === 'flying';
    const checks = landingChecks(l);
    const alt = flying ? altitude(l, this.stageData.ground) : 0;
    const tiltDeg = Math.round(Math.abs(Phaser.Math.RadToDeg(Phaser.Math.Angle.Wrap(l.angle))));
    this.setReadout(r.h, `H ${Math.round(Math.abs(l.vx))}`, flying ? (checks.vx ? GREEN : PINK) : MUTED);
    this.setReadout(r.v, `V ${Math.round(l.vy)}`, flying ? (checks.vy ? GREEN : PINK) : MUTED);
    this.setReadout(r.tilt, `TILT ${tiltDeg}`, flying ? (checks.tilt ? GREEN : PINK) : MUTED);
    this.setReadout(r.alt, `ALT ${Math.round(alt)}`, MUTED);
    let call = '';
    let color = MUTED;
    if (flying && alt < CALLOUT_ALT) {
      color = checks.safe ? GREEN : PINK;
      call = checks.safe ? 'SAFE TO LAND' : !checks.vy ? 'SLOW DOWN' : !checks.tilt ? 'LEVEL OUT' : 'KILL DRIFT';
    }
    this.setReadout(r.call, call, color);
  }

  /** Updates a HUD line only when its text or color changed, so steady readouts cost nothing. */
  private setReadout(t: Phaser.GameObjects.Text, text: string, color: string): void {
    if (t.text !== text) t.setText(text);
    if (t.style.color !== color) t.setColor(color);
  }
}
