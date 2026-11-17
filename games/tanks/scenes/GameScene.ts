import Phaser from 'phaser';
import {
  ANGLE_RATE,
  BARREL_LEN,
  CPU_PROFILES,
  type CpuLevel,
  CRATER_R,
  DRAG_FULL,
  DRAG_MIN,
  FALL_GRAVITY,
  FINE_AIM,
  GAME_ID,
  HEIGHT,
  HINT_SECONDS,
  HUD_H,
  MAX_HP,
  MAX_POWER,
  POWER_RATE,
  ROUNDS_TO_WIN,
  SIM_DT,
  SPAWN_RANGES,
  START_ANGLE,
  START_POWER,
  STREAK_KEY,
  TANK_FOOT,
  TANK_H,
  TANK_W,
  TOUCH_GRAB,
  TROPHY_LEVELS,
  TURRET_R,
  WIDTH,
  WIND_MAX,
} from '../config';
import {
  blastDamage,
  centerOf,
  checkImpact,
  clampAngle,
  clampPower,
  fallDamage,
  type Impact,
  launch,
  muzzleOf,
  pivotOf,
  restY,
  rollWind,
  type Shell,
  simulateShot,
  stepShell,
  type TankPos,
} from '../ballistics';
import { cpuShot } from '../cpu';
import { fillGround, type Point, strokeLine } from '../draw';
import { applyDamage, countsForPlayer, matchScore, matchWinner, nextStreak, other, readStreak, roundWinner } from '../match';
import { carveCrater, flattenAt, generateTerrain, type Heights } from '../terrain';
import { trophiesFor } from '../../../shared/achievements';
import { ArcadeControls } from '../../../shared/controls';
import { frameSeconds } from '../../../shared/frame';
import { PauseController } from '../../../shared/pause';
import { createRng, type Rng } from '../../../shared/rng';
import { endRun, SCENE, showMatchResult } from '../../../shared/scenes';
import { noise, tone } from '../../../shared/sfx';
import { loadJSON, saveJSON } from '../../../shared/storage';
import { isTouchDevice, VirtualButton } from '../../../shared/touch';
import { drawGrid, floatText, hex, HUD_LABEL_STYLE, HUD_STYLE, impact, NEON, PIXEL_FONT, showBanner, sparkTexture } from '../../../shared/ui';
import type { TROPHIES } from '../trophies';

const { reach, unlock } = trophiesFor<typeof TROPHIES>();

type Seat = 0 | 1;

/**
 * aim: a human is aiming. cpu: the CPU is thinking and turning its barrel. flight: a shell is in
 * the air. settle: the dust settles and undermined tanks fall. between: round banners. over: done.
 */
type Phase = 'aim' | 'cpu' | 'flight' | 'settle' | 'between' | 'over';

interface Tank extends TankPos {
  seat: Seat;
  color: number;
  label: string;
  hp: number;
  /** Degrees from the right-hand horizontal (see ballistics.ts). */
  angle: number;
  power: number;
  cpu: boolean;
  /** Where a fall started, while the tank is falling. */
  fallFrom: number | null;
  vy: number;
}

export interface TanksData {
  players?: 1 | 2;
  /** Solo only: how strong the CPU is. Normal when left out. */
  cpu?: CpuLevel;
}

/** Seconds a key or d-pad direction must be held before aiming sweeps; a tap moves one step. */
const HOLD_DELAY = 0.22;
/** The shortest time the explosion gets before the next turn, in seconds. */
const SETTLE_MIN_S = 0.7;

export class GameScene extends Phaser.Scene {
  private versus = false;
  private cpuLevel: CpuLevel = 'normal';
  private rng!: Rng;
  private heights: Heights = [];
  private tanks: [Tank, Tank] = [] as unknown as [Tank, Tank];
  private turn: Seat = 0;
  private starter: Seat = 0;
  private rounds: [number, number] = [0, 0];
  private round = 1;
  private wind = 0;
  private phase: Phase = 'between';
  private shell: Shell | null = null;
  private shooter: Seat = 0;
  private stepAcc = 0;
  private settleTime = 0;
  private cpuAttempts = 0;
  private damageDealt = 0;
  private holdX = 0;
  private holdY = 0;
  private drag: { id: number; x: number; y: number } | null = null;
  /** Easy-mode trajectory hint, recomputed only when the aim or the wind changes. */
  private hint: { key: string; points: { x: number; y: number }[] } = { key: '', points: [] };

  private controls: ArcadeControls[] = [];
  private pause!: PauseController;
  private buttons: VirtualButton[] = [];
  private terrainGfx!: Phaser.GameObjects.Graphics;
  private gfx!: Phaser.GameObjects.Graphics;
  private trail!: Phaser.GameObjects.Particles.ParticleEmitter;
  private debris!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private hpTexts: Phaser.GameObjects.Text[] = [];
  private windText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private aimText!: Phaser.GameObjects.Text;
  private aimColor = -1;

  constructor() {
    super(SCENE.game);
  }

  init(data: TanksData): void {
    this.versus = data.players === 2;
    this.cpuLevel = data.cpu && data.cpu in CPU_PROFILES ? data.cpu : 'normal';
    this.rng = createRng(Math.floor(Math.random() * 0xffffffff));
    this.rounds = [0, 0];
    this.round = 1;
    this.phase = 'between';
    this.shell = null;
    this.damageDealt = 0;
    this.drag = null;
    this.hint = { key: '', points: [] };
    this.buttons = [];
    this.aimColor = -1;
    this.starter = this.rng.next() < 0.5 ? 0 : 1;
  }

  create(): void {
    this.cameras.main.fadeIn(250, 5, 5, 13);
    drawGrid(this, WIDTH, HEIGHT);
    this.terrainGfx = this.add.graphics();
    this.gfx = this.add.graphics().setDepth(5);
    this.trail = this.add
      .particles(0, 0, sparkTexture(this), {
        lifespan: 380,
        frequency: 12,
        scale: { start: 1.1, end: 0 },
        alpha: { start: 0.7, end: 0 },
        tint: NEON.yellow,
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(4);
    this.debris = this.add
      .particles(0, 0, sparkTexture(this), {
        speed: { min: 90, max: 340 },
        angle: { min: 200, max: 340 },
        gravityY: 700,
        lifespan: 1000,
        scale: { start: 0.9, end: 0.2 },
        alpha: { start: 1, end: 0 },
        emitting: false,
      })
      .setDepth(6);
    this.sparks = this.add
      .particles(0, 0, sparkTexture(this), {
        speed: { min: 60, max: 260 },
        lifespan: 500,
        scale: { start: 1.2, end: 0 },
        alpha: { start: 1, end: 0 },
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(7);

    if (this.versus) {
      this.controls = [new ArcadeControls(this, undefined, { player: 1 }), new ArcadeControls(this, undefined, { player: 2 })];
    } else {
      this.controls = [new ArcadeControls(this)];
    }
    const cpuName = this.cpuLevel === 'normal' ? 'CPU' : `${this.cpuLevel.toUpperCase()} CPU`;
    const make = (seat: Seat, color: number, label: string, cpu: boolean): Tank => ({
      seat,
      color,
      label,
      hp: MAX_HP,
      angle: seat === 0 ? START_ANGLE : 180 - START_ANGLE,
      power: START_POWER,
      cpu,
      x: 0,
      y: 0,
      fallFrom: null,
      vy: 0,
    });
    this.tanks = this.versus
      ? [make(0, NEON.cyan, 'P1', false), make(1, NEON.pink, 'P2', false)]
      : [make(0, NEON.cyan, 'YOU', false), make(1, NEON.pink, cpuName, true)];

    this.buildHud();
    this.pause = new PauseController(this, this.controls, {
      canPause: () => this.phase !== 'over',
      restartData: this.versus ? { players: 2 } : { players: 1, cpu: this.cpuLevel },
    });
    if (isTouchDevice()) this.buildButtons();
    this.bindTouch();
    this.startRound();
  }

  // ---------------------------------------------------------------- setup

  private buildHud(): void {
    this.hpTexts = this.tanks.map((t) => {
      const left = t.seat === 0;
      const x = left ? 20 : WIDTH - 20;
      this.add
        .text(x, 12, t.label, { ...HUD_LABEL_STYLE, color: hex(t.color) })
        .setOrigin(left ? 0 : 1, 0)
        .setDepth(20);
      return this.add
        .text(left ? 200 : WIDTH - 200, 12, '', { ...HUD_LABEL_STYLE })
        .setOrigin(left ? 1 : 0, 0)
        .setDepth(20);
    });
    this.add.text(WIDTH / 2, 8, 'WIND', { ...HUD_LABEL_STYLE }).setOrigin(0.5, 0).setDepth(20);
    this.windText = this.add.text(WIDTH / 2, 40, '', { ...HUD_STYLE, fontSize: '12px' }).setOrigin(0.5, 0).setDepth(20);
    this.roundText = this.add.text(WIDTH / 2, 58, '', { ...HUD_LABEL_STYLE }).setOrigin(0.5, 0).setDepth(20);
    this.aimText = this.add
      .text(WIDTH / 2, HUD_H + 12, '', { fontFamily: PIXEL_FONT, fontSize: '11px', color: hex(NEON.white) })
      .setOrigin(0.5, 0)
      .setDepth(20);
  }

  /** On-screen aim and fire buttons; they drive whichever tank's turn it is. */
  private buildButtons(): void {
    const y = HEIGHT - 44;
    const defs: [number, string, number, 'left' | 'right' | 'down' | 'up' | 'action'][] = [
      [44, '<', NEON.cyan, 'left'],
      [112, '>', NEON.cyan, 'right'],
      [190, '-', NEON.yellow, 'down'],
      [258, '+', NEON.yellow, 'up'],
    ];
    for (const [x, label, color, action] of defs) {
      const b = new VirtualButton(this, x, y, label, color, 28);
      this.buttons.push(b);
      for (const c of this.controls) c.addVirtual(action, () => b.isDown);
    }
    const fire = new VirtualButton(this, WIDTH - 70, y - 10, 'FIRE', NEON.pink, 40);
    this.buttons.push(fire);
    for (const c of this.controls) c.addVirtual('action', () => fire.isDown);
  }

  /** Drag from your tank to aim: direction sets the angle, distance the power. Let go to fire. */
  private bindTouch(): void {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.pause.isPaused || this.phase !== 'aim' || this.drag) return;
      if (this.buttons.some((b) => b.contains(p.x, p.y))) return;
      const pv = pivotOf(this.tanks[this.turn]);
      if (Math.hypot(p.x - pv.x, p.y - pv.y) > TOUCH_GRAB) return;
      this.drag = { id: p.id, x: p.x, y: p.y };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.drag || p.id !== this.drag.id || this.phase !== 'aim') return;
      this.drag.x = p.x;
      this.drag.y = p.y;
      this.aimAt(p.x, p.y);
    });
    const release = (p: Phaser.Input.Pointer) => {
      if (!this.drag || p.id !== this.drag.id) return;
      this.drag = null;
      if (this.pause.isPaused || this.phase !== 'aim') return;
      const pv = pivotOf(this.tanks[this.turn]);
      // A short drag that ends back on the tank is a change of mind, not a shot.
      if (Math.hypot(p.x - pv.x, p.y - pv.y) >= DRAG_MIN) this.fire();
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);
  }

  private aimAt(x: number, y: number): void {
    const t = this.tanks[this.turn];
    const pv = pivotOf(t);
    const dx = x - pv.x;
    const up = pv.y - y;
    const len = Math.hypot(dx, up);
    if (len < DRAG_MIN) return;
    // Below the tank, the barrel stays level on that side.
    t.angle = up < 0 ? (dx >= 0 ? 0 : 180) : clampAngle((Math.atan2(up, dx) * 180) / Math.PI);
    t.power = clampPower((len / DRAG_FULL) * MAX_POWER);
  }

  // ---------------------------------------------------------------- flow

  private startRound(): void {
    this.phase = 'between';
    this.heights = generateTerrain(this.rng.next, WIDTH);
    this.cpuAttempts = 0;
    for (const t of this.tanks) {
      const [from, to] = SPAWN_RANGES[t.seat];
      t.x = from + this.rng.next() * (to - from);
      flattenAt(this.heights, t.x, TANK_FOOT + 6);
      t.y = restY(this.heights, t.x);
      t.hp = MAX_HP;
      t.angle = t.seat === 0 ? START_ANGLE : 180 - START_ANGLE;
      t.power = START_POWER;
      t.fallFrom = null;
      t.vy = 0;
    }
    this.drawTerrain();
    this.roundText.setText(`ROUND ${this.round}`);
    this.wind = 0;
    this.windText.setText('');
    this.aimText.setText('');
    showBanner(this, `ROUND ${this.round}`, NEON.yellow);
    tone({ freq: 330, toFreq: 660, duration: 0.2, type: 'triangle', volume: 0.07 });
    this.turn = this.starter;
    this.time.delayedCall(1300, () => this.beginTurn());
  }

  private beginTurn(): void {
    if (this.phase === 'over') return;
    this.wind = rollWind(this.rng.next(), WIND_MAX);
    this.windText.setText(this.wind === 0 ? 'CALM' : String(Math.abs(this.wind)));
    const t = this.tanks[this.turn];
    this.holdX = 0;
    this.holdY = 0;
    this.drag = null;
    tone({ freq: 520, duration: 0.05, type: 'square', volume: 0.04 });
    if (t.cpu) {
      this.phase = 'cpu';
      this.time.delayedCall(650, () => this.cpuAim(t));
    } else {
      this.phase = 'aim';
    }
  }

  /** The CPU picks its shot, swings the barrel and power over to it, then fires. */
  private cpuAim(t: Tank): void {
    if (this.phase !== 'cpu') return;
    const aim = cpuShot(this.heights, this.tanks, t.seat, other(t.seat), this.wind, CPU_PROFILES[this.cpuLevel], this.cpuAttempts, this.rng.next);
    this.cpuAttempts++;
    this.tweens.add({
      targets: t,
      angle: aim.angle,
      power: aim.power,
      duration: 700,
      ease: 'Sine.easeInOut',
      onComplete: () => this.time.delayedCall(250, () => this.fire()),
    });
  }

  private fire(): void {
    if (this.phase !== 'aim' && this.phase !== 'cpu') return;
    const t = this.tanks[this.turn];
    this.phase = 'flight';
    this.drag = null;
    this.shooter = t.seat;
    this.shell = launch(t, t.angle, t.power);
    this.stepAcc = 0;
    this.trail.setPosition(this.shell.x, this.shell.y);
    this.trail.start();
    const m = muzzleOf(t, t.angle);
    this.sparks.setParticleTint(NEON.yellow);
    this.sparks.explode(8, m.x, m.y);
    tone({ freq: 200, toFreq: 70, duration: 0.18, type: 'sawtooth', volume: 0.07 });
    noise(0.08, 0.05);
  }

  update(_time: number, deltaMs: number): void {
    if (this.pause.isPaused) return;
    const dt = frameSeconds(deltaMs);
    if (this.phase === 'aim') this.humanAim(dt);
    else if (this.phase === 'flight') this.flyShell(dt);
    else if (this.phase === 'settle') this.settle(dt);
    this.render();
  }

  private humanAim(dt: number): void {
    const t = this.tanks[this.turn];
    // Hot seat: whoever's turn it is can use either seat's keys or pad.
    let ax = 0;
    let ay = 0;
    let fine = 1;
    for (const c of this.controls) {
      if (ax === 0) ax = c.axisX;
      if (ay === 0) ay = c.axisY;
      if (c.isDown('alt')) fine = FINE_AIM;
    }
    const step = (axis: number, held: number, rate: number): number => {
      if (axis === 0) return 0;
      if (held === 0) return Math.sign(axis);
      return held > HOLD_DELAY ? axis * rate * fine * dt : 0;
    };
    // Right turns the barrel clockwise (towards the right); up adds power.
    t.angle = clampAngle(t.angle - step(ax, this.holdX, ANGLE_RATE));
    t.power = clampPower(t.power - step(ay, this.holdY, POWER_RATE));
    this.holdX = ax === 0 ? 0 : this.holdX + dt;
    this.holdY = ay === 0 ? 0 : this.holdY + dt;
    if (this.controls.some((c) => c.justPressed('action'))) this.fire();
  }

  private flyShell(dt: number): void {
    const s = this.shell;
    if (!s) return;
    // Fixed steps, so the shell flies exactly as the hint and the CPU predicted.
    this.stepAcc += dt;
    while (this.stepAcc >= SIM_DT) {
      this.stepAcc -= SIM_DT;
      stepShell(s, this.wind, SIM_DT);
      const hit = checkImpact(s, this.heights, this.tanks, this.shooter);
      if (hit) {
        this.explode(hit);
        return;
      }
    }
    this.trail.setPosition(s.x, s.y);
  }

  private explode(hit: Impact): void {
    this.shell = null;
    this.trail.stop();
    this.phase = 'settle';
    this.settleTime = 0;
    if (hit.kind === 'out' || hit.kind === 'timeout') {
      floatText(this, Phaser.Math.Clamp(hit.x, 40, WIDTH - 40), Phaser.Math.Clamp(hit.y, HUD_H + 40, HEIGHT - 40), 'MISS', NEON.muted);
      tone({ freq: 300, toFreq: 150, duration: 0.15, type: 'triangle', volume: 0.05 });
      return;
    }

    const { x, y } = hit;
    if (carveCrater(this.heights, x, y, CRATER_R)) this.drawTerrain();

    const hurt: ArcadeControls[] = [];
    let total = 0;
    for (const t of this.tanks) {
      const c = centerOf(t);
      const direct = hit.kind === 'tank' && hit.tank === t.seat;
      const dmg = blastDamage(Math.hypot(x - c.x, y - c.y), direct);
      if (dmg <= 0) continue;
      this.damage(t, dmg, direct ? 'DIRECT HIT' : undefined);
      total += dmg;
      const own = this.controlsOf(t);
      if (own) hurt.push(own);
      const shooter = this.tanks[this.shooter];
      if (direct && t !== shooter && !shooter.cpu) reach('tanks.longshot', Math.abs(shooter.x - t.x));
    }

    // Flash, a ring of fire and a spray of dirt.
    const flash = this.add.circle(x, y, CRATER_R, NEON.white, 0.9).setBlendMode(Phaser.BlendModes.ADD).setDepth(8);
    this.tweens.add({ targets: flash, scale: 1.9, alpha: 0, duration: 280, ease: 'Cubic.easeOut', onComplete: () => flash.destroy() });
    const ring = this.add.circle(x, y, CRATER_R * 0.6).setStrokeStyle(3, NEON.orange, 1).setDepth(8);
    this.tweens.add({ targets: ring, scale: 2.4, alpha: 0, duration: 420, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
    this.debris.setParticleTint(NEON.green);
    this.debris.explode(26, x, y);
    this.sparks.setParticleTint(NEON.orange);
    this.sparks.explode(22, x, y);
    impact(this, hurt, total > 0 ? 260 : 160, total > 25 ? 0.012 : 0.006);
    noise(0.35, 0.12);
    tone({ freq: 140, toFreq: 40, duration: 0.35, type: 'sawtooth', volume: 0.08 });

    // Tanks with the ground blown away from under them start to fall.
    for (const t of this.tanks) {
      if (restY(this.heights, t.x) > t.y + 0.5) {
        t.fallFrom = t.y;
        t.vy = 0;
      }
    }
  }

  private settle(dt: number): void {
    this.settleTime += dt;
    let falling = false;
    for (const t of this.tanks) {
      if (t.fallFrom === null) continue;
      const rest = restY(this.heights, t.x);
      t.vy += FALL_GRAVITY * dt;
      t.y += t.vy * dt;
      if (t.y < rest) {
        falling = true;
        continue;
      }
      t.y = rest;
      const dmg = fallDamage(rest - t.fallFrom);
      t.fallFrom = null;
      t.vy = 0;
      tone({ freq: 110, duration: 0.08, type: 'square', volume: 0.05 });
      if (dmg > 0) this.damage(t, dmg, 'FALL');
    }
    if (!falling && this.settleTime >= SETTLE_MIN_S) this.resolveTurn();
  }

  /** Hurts `t`; `this.shooter` fired the shot behind it (the blast, or the crater it falls into). */
  private damage(t: Tank, amount: number, note?: string): void {
    const { hp, dealt } = applyDamage(t.hp, amount);
    t.hp = hp;
    if (countsForPlayer(this.versus, t.seat, this.shooter)) this.damageDealt += dealt;
    const c = centerOf(t);
    floatText(this, c.x, c.y - 26, note ? `${note} -${amount}` : `-${amount}`, t.color, 11);
  }

  private controlsOf(t: Tank): ArcadeControls | undefined {
    if (t.cpu) return undefined;
    return this.versus ? this.controls[t.seat] : this.controls[0];
  }

  private resolveTurn(): void {
    const result = roundWinner([this.tanks[0].hp, this.tanks[1].hp]);
    if (result === null) {
      this.phase = 'between';
      this.turn = other(this.turn);
      this.time.delayedCall(350, () => this.beginTurn());
      return;
    }
    this.phase = 'between';
    for (const t of this.tanks) if (t.hp <= 0) this.destroyTank(t);
    if (result === 'draw') {
      showBanner(this, 'DRAW! REPLAY', NEON.yellow);
      this.time.delayedCall(1800, () => this.startRound());
      return;
    }
    this.rounds[result]++;
    const winner = this.tanks[result];
    showBanner(this, `${winner.label} TAKES ROUND ${this.round}`, winner.color);
    const done = matchWinner(this.rounds);
    if (done !== null) {
      this.time.delayedCall(1500, () => this.endMatch(done));
      return;
    }
    this.round++;
    // The loser of a round shoots first in the next.
    this.starter = other(result);
    this.time.delayedCall(2000, () => this.startRound());
  }

  private destroyTank(t: Tank): void {
    const c = centerOf(t);
    this.sparks.setParticleTint(t.color);
    this.sparks.explode(40, c.x, c.y);
    this.debris.setParticleTint(t.color);
    this.debris.explode(20, c.x, c.y);
    const own = this.controlsOf(t);
    impact(this, own ? [own] : [], 350, 0.012);
    tone({ freq: 400, toFreq: 60, duration: 0.5, type: 'sawtooth', volume: 0.09 });
  }

  private endMatch(winner: Seat): void {
    this.phase = 'over';
    const [a, b] = this.rounds;
    if (!this.versus) {
      const won = winner === 0;
      if (won && TROPHY_LEVELS.includes(this.cpuLevel)) unlock('tanks.win');
      const streak = nextStreak(readStreak(loadJSON<unknown>(STREAK_KEY, null)), won);
      saveJSON(STREAK_KEY, streak);
      if (won) reach('tanks.streak', streak.current);
      const score = matchScore({ won, roundsWon: a, damageDealt: this.damageDealt, level: this.cpuLevel });
      const cpuName = this.tanks[1].label;
      const detail = won ? `YOU BEAT THE ${cpuName} ${a}-${b}   STREAK ${streak.current}` : `${cpuName} WINS ${b}-${a}`;
      endRun(this, { gameId: GAME_ID, score, detail }, 400);
      return;
    }
    unlock('tanks.versus');
    showMatchResult(this, this.controls, {
      gameId: GAME_ID,
      title: `PLAYER ${winner + 1} WINS!`,
      color: this.tanks[winner].color,
      tally: `${a} - ${b}`,
      rematchData: { players: 2 },
    });
  }

  // ---------------------------------------------------------------- render

  /** The ground only changes when a shell lands, so it has its own layer, redrawn then. */
  private drawTerrain(): void {
    const g = this.terrainGfx.clear();
    const h = this.heights;
    const surface: Point[] = [];
    for (let x = 0; x < h.length; x += 4) surface.push({ x, y: h[x] });
    if (surface[surface.length - 1].x !== WIDTH) surface.push({ x: WIDTH, y: h[h.length - 1] });
    g.fillStyle(NEON.green, 0.07);
    fillGround(g, surface, HEIGHT);
    // Faint strata under the surface give the ground some depth.
    g.lineStyle(1, NEON.green, 0.16);
    strokeLine(g, surface, 18, HEIGHT);
    g.lineStyle(1, NEON.green, 0.08);
    strokeLine(g, surface, 42, HEIGHT);
    g.lineStyle(9, NEON.green, 0.12);
    strokeLine(g, surface);
    g.lineStyle(2, NEON.green, 1);
    strokeLine(g, surface);
  }

  private render(): void {
    const g = this.gfx.clear();
    const active = this.tanks[this.turn];
    const aiming = this.phase === 'aim' || this.phase === 'cpu';

    if (this.phase === 'aim' && !this.versus && this.cpuLevel === 'easy') this.drawHint(g, active);
    if (this.drag) {
      const pv = pivotOf(active);
      g.lineStyle(2, active.color, 0.35).lineBetween(pv.x, pv.y, this.drag.x, this.drag.y);
      g.fillStyle(active.color, 0.5).fillCircle(this.drag.x, this.drag.y, 6);
    }

    for (const t of this.tanks) this.drawTank(g, t, aiming && t === active);

    if (this.shell) {
      g.fillStyle(NEON.yellow, 0.3).fillCircle(this.shell.x, this.shell.y, 7);
      g.fillStyle(NEON.white, 1).fillCircle(this.shell.x, this.shell.y, 3);
    }

    this.drawHud(g, aiming ? active : null);
  }

  private drawHint(g: Phaser.GameObjects.Graphics, t: Tank): void {
    const key = `${t.angle.toFixed(1)}:${t.power.toFixed(1)}:${this.wind}`;
    if (this.hint.key !== key) {
      const points: { x: number; y: number }[] = [];
      let n = 0;
      simulateShot(this.heights, this.tanks, t.seat, t.angle, t.power, this.wind, {
        onStep: (s) => {
          if (n++ % 8 === 0) points.push({ x: s.x, y: s.y });
          return s.t < HINT_SECONDS;
        },
      });
      this.hint = { key, points };
    }
    this.hint.points.forEach((p, i) => g.fillStyle(t.color, 0.8 - (i / this.hint.points.length) * 0.6).fillCircle(p.x, p.y, 2));
  }

  private drawTank(g: Phaser.GameObjects.Graphics, t: Tank, active: boolean): void {
    if (t.hp <= 0) {
      // A wreck: dim hull, no barrel.
      g.fillStyle(t.color, 0.25).fillRoundedRect(t.x - TANK_W / 2, t.y - TANK_H / 2, TANK_W, TANK_H / 2, 3);
      return;
    }
    const pv = pivotOf(t);
    const m = muzzleOf(t, t.angle);
    g.fillStyle(t.color, 0.18).fillRoundedRect(t.x - TANK_W / 2 - 5, t.y - TANK_H - TURRET_R - 4, TANK_W + 10, TANK_H + TURRET_R + 6, 8);
    g.lineStyle(4, active ? NEON.white : t.color, 1).lineBetween(pv.x, pv.y, m.x, m.y);
    g.fillStyle(t.color, 1).fillCircle(pv.x, pv.y, TURRET_R);
    g.fillStyle(t.color, 1).fillRoundedRect(t.x - TANK_W / 2, t.y - TANK_H, TANK_W, TANK_H, 4);
    g.lineStyle(2, NEON.bg, 0.6).lineBetween(t.x - TANK_W / 2 + 4, t.y - 4, t.x + TANK_W / 2 - 4, t.y - 4);
    if (active) {
      const bob = Math.sin(this.time.now / 180) * 3;
      const top = t.y - TANK_H - TURRET_R - BARREL_LEN - 6 + bob;
      g.fillStyle(t.color, 1).fillTriangle(t.x - 6, top - 8, t.x + 6, top - 8, t.x, top);
    }
  }

  private drawHud(g: Phaser.GameObjects.Graphics, active: Tank | null): void {
    g.lineStyle(1, NEON.purple, 0.4).lineBetween(0, HUD_H, WIDTH, HUD_H);
    for (const t of this.tanks) {
      const left = t.seat === 0;
      const x = left ? 20 : WIDTH - 200;
      g.fillStyle(NEON.muted, 0.2).fillRect(x, 30, 180, 10);
      const w = (180 * t.hp) / MAX_HP;
      g.fillStyle(t.color, 1).fillRect(left ? x : x + 180 - w, 30, w, 10);
      this.hpTexts[t.seat].setText(`${t.hp} HP`);
      // Round wins as pips under the bar.
      for (let i = 0; i < ROUNDS_TO_WIN; i++) {
        const px = left ? x + 6 + i * 18 : x + 174 - i * 18;
        if (i < this.rounds[t.seat]) g.fillStyle(t.color, 1).fillCircle(px, 54, 5);
        else g.lineStyle(1.5, t.color, 0.6).strokeCircle(px, 54, 5);
      }
    }

    // Wind: an arrow that points and stretches with it.
    if (this.wind !== 0) {
      const dir = Math.sign(this.wind);
      const len = 8 + Math.abs(this.wind) * 4;
      const cy = 30;
      const x0 = WIDTH / 2 - (dir * len) / 2;
      const x1 = WIDTH / 2 + (dir * len) / 2;
      g.lineStyle(3, NEON.cyan, 1).lineBetween(x0, cy, x1, cy);
      g.fillStyle(NEON.cyan, 1).fillTriangle(x1 + dir * 8, cy, x1, cy - 6, x1, cy + 6);
    }

    let line = '';
    if (active && !active.cpu) {
      const elev = active.angle <= 90 ? active.angle : 180 - active.angle;
      line = `${active.label}   ANGLE ${Math.round(elev)}   POWER ${Math.round(active.power)}`;
    } else if (active) {
      line = `${active.label} IS AIMING`;
    }
    // Restyling text redraws it, so only touch it when something changed.
    if (active && active.color !== this.aimColor) {
      this.aimColor = active.color;
      this.aimText.setColor(hex(active.color));
    }
    this.aimText.setText(line);
  }
}
