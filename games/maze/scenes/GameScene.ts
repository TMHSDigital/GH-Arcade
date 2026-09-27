import Phaser from 'phaser';
import {
  BONUS_AT,
  BONUS_POINTS,
  BONUS_TIME,
  CATCH_FREEZE_MS,
  CELL,
  CHASER_SPEED,
  CHASER_SPEED_MAX,
  CHASER_SPEED_STEP,
  CLEAR_MS,
  COLS,
  DEATH_MS,
  EXTRA_LIFE_AT,
  EYES_SPEED,
  GAME_ID,
  GRID_X,
  GRID_Y,
  HOUSE_SPEED,
  MODE_SCHEDULE,
  POINTS_CHASER,
  POINTS_DOT,
  POINTS_POWER,
  READY_MS,
  RELEASE_TIMES,
  ROWS,
  RUNNER_SPEED,
  RUNNER_SPEED_MAX,
  RUNNER_SPEED_STEP,
  SCARED_SPEED,
  SCARED_TIME,
  SCARED_TIME_MIN,
  SCARED_TIME_STEP,
  SCARED_WARN,
  START_LIVES,
  TUNNEL_SPEED,
  WIDTH,
} from '../config';
import { BONUS_CELL, DIRS, find, HOUSE_EXIT, HOUSE_Y, MAZE, OPPOSITE, open, tile, TUNNEL_ROW, VEC, wrapX, type Dir } from '../maze';
import { unlock } from '../../../shared/achievements';
import { ArcadeControls } from '../../../shared/controls';
import { PauseController } from '../../../shared/pause';
import { noise, tone } from '../../../shared/sfx';
import { onSwipe } from '../../../shared/touch';
import { burstEmitter, floatText, NEON, PIXEL_FONT, showBanner } from '../../../shared/ui';

/** Anything that walks the grid. Positions are in cells; whole numbers are cell centers. */
interface Mover {
  x: number;
  y: number;
  dir: Dir | null;
}

type ChaserKind = 'hunter' | 'ambusher' | 'flanker' | 'drifter';
type ChaserState = 'house' | 'leaving' | 'active' | 'eyes' | 'entering';

interface Chaser extends Mover {
  kind: ChaserKind;
  color: number;
  state: ChaserState;
  scared: boolean;
  homeX: number;
  corner: { x: number; y: number };
  releaseAt: number;
}

type Phase = 'ready' | 'play' | 'dying' | 'clearing' | 'over';

const CHASERS: { kind: ChaserKind; color: keyof typeof NEON; homeX: number; corner: { x: number; y: number } }[] = [
  { kind: 'hunter', color: 'pink', homeX: 12, corner: { x: COLS - 2, y: -2 } },
  { kind: 'ambusher', color: 'cyan', homeX: 12, corner: { x: 1, y: -2 } },
  { kind: 'flanker', color: 'green', homeX: 10, corner: { x: COLS - 1, y: ROWS + 1 } },
  { kind: 'drifter', color: 'orange', homeX: 14, corner: { x: 0, y: ROWS + 1 } },
];

/** Wall color per level, cycling. */
const WALL_COLORS = [NEON.blue, NEON.purple, NEON.cyan, NEON.pink, NEON.green];

const px = (x: number) => GRID_X + x * CELL + CELL / 2;
const py = (y: number) => GRID_Y + y * CELL + CELL / 2;

export class GameScene extends Phaser.Scene {
  private runner: Mover = { x: 0, y: 0, dir: null };
  private queued: Dir | null = null;
  private facing: Dir = 'left';
  private chasers: Chaser[] = [];
  private dots = new Map<number, 'dot' | 'power'>();
  private dotsEaten = 0;
  private bonus: { until: number; points: number } | null = null;

  private score = 0;
  private lives = START_LIVES;
  private level = 1;
  private extraLifeGiven = false;

  /** Scene clock in ms that only runs while unpaused, so every timer below freezes with the pause menu. */
  private clock = 0;
  private phase: Phase = 'ready';
  private phaseUntil = 0;
  private roundStart = 0;
  private modeIndex = 0;
  private modeTime = 0;
  private scaredUntil = 0;
  private catchStreak = 0;
  private freezeUntil = 0;

  private walls!: Phaser.GameObjects.Graphics;
  private gfx!: Phaser.GameObjects.Graphics;
  private burst!: Phaser.GameObjects.Particles.ParticleEmitter;
  private scoreText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private controls!: ArcadeControls;
  private pause!: PauseController;

  constructor() {
    super('Game');
  }

  init(): void {
    this.score = 0;
    this.lives = START_LIVES;
    this.level = 1;
    this.extraLifeGiven = false;
    this.clock = 0;
  }

  create(): void {
    this.cameras.main.fadeIn(250, 5, 5, 13);
    this.walls = this.add.graphics();
    this.gfx = this.add.graphics();
    this.burst = burstEmitter(this, 220, 600);
    const style = { fontFamily: PIXEL_FONT, fontSize: '16px', color: '#e8e8ff' };
    this.add.text(GRID_X, 22, 'SCORE', { ...style, fontSize: '10px', color: '#8a8ab8' });
    this.scoreText = this.add.text(GRID_X, 38, '0', style);
    this.levelText = this.add.text(WIDTH / 2, 38, '', { ...style, fontSize: '12px' }).setOrigin(0.5, 0);

    this.controls = new ArcadeControls(this);
    this.pause = new PauseController(this, this.controls, { canPause: () => this.phase !== 'over' });
    onSwipe(this, (d) => d !== 'tap' && this.steer(d), { threshold: 18, continuous: true });

    this.startLevel();
  }

  // ---------------------------------------------------------------- flow

  private startLevel(): void {
    this.dots.clear();
    MAZE.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (ch === '.') this.dots.set(y * COLS + x, 'dot');
        else if (ch === 'o') this.dots.set(y * COLS + x, 'power');
      }),
    );
    this.dotsEaten = 0;
    this.bonus = null;
    this.levelText.setText(`LEVEL ${this.level}`);
    this.drawWalls(WALL_COLORS[(this.level - 1) % WALL_COLORS.length]);
    this.startRound(this.level === 1 ? 'READY' : `LEVEL ${this.level}`);
  }

  /** Puts everyone back in their starting spots; the dots stay as they are. */
  private startRound(banner = 'READY'): void {
    const start = find('P');
    this.runner = { x: start.x, y: start.y, dir: null };
    this.queued = null;
    this.facing = 'left';
    const releaseScale = Math.max(0.3, 1 - 0.15 * (this.level - 1));
    this.chasers = CHASERS.map((spec, i) => {
      const outside = i === 0;
      return {
        kind: spec.kind,
        color: NEON[spec.color],
        x: outside ? HOUSE_EXIT.x : spec.homeX,
        y: outside ? HOUSE_EXIT.y : HOUSE_Y,
        dir: outside ? 'left' : null,
        state: outside ? 'active' : 'house',
        scared: false,
        homeX: spec.homeX,
        corner: spec.corner,
        releaseAt: RELEASE_TIMES[i] * 1000 * releaseScale,
      } satisfies Chaser;
    });
    this.modeIndex = 0;
    this.modeTime = 0;
    this.scaredUntil = 0;
    this.freezeUntil = 0;
    this.setPhase('ready', READY_MS);
    showBanner(this, banner, NEON.yellow, py(BONUS_CELL.y));
  }

  private setPhase(phase: Phase, ms = 0): void {
    this.phase = phase;
    this.phaseUntil = this.clock + ms;
    if (phase === 'play') this.roundStart = this.clock;
  }

  update(_time: number, deltaMs: number): void {
    if (this.pause.isPaused) return;
    const dt = Math.min(deltaMs, 50) / 1000;
    this.clock += dt * 1000;
    this.readInput();

    const phaseDone = this.clock >= this.phaseUntil;
    if (this.phase === 'ready' && phaseDone) {
      this.setPhase('play');
    } else if (this.phase === 'dying' && phaseDone) {
      this.afterDeath();
    } else if (this.phase === 'clearing' && phaseDone) {
      this.level++;
      if (this.level >= 3) unlock('maze.level3');
      this.startLevel();
    } else if (this.phase === 'play' && this.clock >= this.freezeUntil) {
      this.tick(dt);
    }
    this.render();
  }

  private readInput(): void {
    const c = this.controls;
    const ax = c.axisX;
    const ay = c.axisY;
    if (Math.abs(ax) < 0.5 && Math.abs(ay) < 0.5) return;
    if (Math.abs(ax) >= Math.abs(ay)) this.steer(ax < 0 ? 'left' : 'right');
    else this.steer(ay < 0 ? 'up' : 'down');
  }

  private steer(dir: Dir): void {
    this.queued = dir;
  }

  private tick(dt: number): void {
    // Scatter / chase schedule, which holds still while the chasers are scared.
    if (this.clock >= this.scaredUntil) {
      this.catchStreak = 0;
      this.modeTime += dt;
      const phaseLen = MODE_SCHEDULE[this.modeIndex];
      if (phaseLen !== undefined && this.modeTime >= phaseLen) {
        this.modeTime = 0;
        this.modeIndex++;
        this.reverseChasers();
      }
      for (const ch of this.chasers) ch.scared = false;
    }

    this.moveRunner(dt);
    for (const ch of this.chasers) this.moveChaser(ch, dt);
    this.checkCatches();

    if (this.bonus && this.clock >= this.bonus.until) this.bonus = null;
    if (this.dots.size === 0) this.clearLevel();
  }

  // ---------------------------------------------------------------- movement

  /**
   * Walks a mover `dist` cells along its direction, stopping at each cell center to run `atCenter`,
   * which may turn or stop it. The tunnel row wraps around.
   */
  private advance(m: Mover, dist: number, atCenter: (m: Mover) => void): void {
    for (let guard = 0; dist > 1e-6 && m.dir && guard < 8; guard++) {
      const v = VEC[m.dir];
      const horizontal = v.x !== 0;
      const pos = horizontal ? m.x : m.y;
      const sign = horizontal ? v.x : v.y;
      const next = sign > 0 ? Math.floor(pos + 1e-6) + 1 : Math.ceil(pos - 1e-6) - 1;
      const remain = Math.abs(next - pos);
      if (dist < remain) {
        if (horizontal) m.x += sign * dist;
        else m.y += sign * dist;
        return;
      }
      if (horizontal) m.x = wrapX(next);
      else m.y = next;
      dist -= remain;
      atCenter(m);
    }
  }

  private runnerSpeed(): number {
    return Math.min(RUNNER_SPEED + RUNNER_SPEED_STEP * (this.level - 1), RUNNER_SPEED_MAX);
  }

  private moveRunner(dt: number): void {
    const r = this.runner;
    // Turning around works instantly, even between cells.
    if (this.queued && r.dir && this.queued === OPPOSITE[r.dir]) {
      r.dir = this.queued;
      this.queued = null;
    }
    // Standing still at a center: set off as soon as a direction is open.
    if (!r.dir && this.queued) {
      const v = VEC[this.queued];
      if (open(r.x + v.x, r.y + v.y)) {
        r.dir = this.queued;
        this.queued = null;
      }
    }
    if (r.dir) this.facing = r.dir;
    this.advance(r, this.runnerSpeed() * dt, () => this.runnerAtCenter());
  }

  private runnerAtCenter(): void {
    const r = this.runner;
    this.eatAt(r.x, r.y);
    // A turn pressed early is held until the corner, so cornering feels forgiving.
    if (this.queued) {
      const q = VEC[this.queued];
      if (open(r.x + q.x, r.y + q.y)) {
        r.dir = this.queued;
        this.queued = null;
        return;
      }
    }
    if (r.dir) {
      const v = VEC[r.dir];
      if (!open(r.x + v.x, r.y + v.y)) r.dir = null;
    }
  }

  private chaserSpeed(ch: Chaser): number {
    if (ch.state === 'eyes' || ch.state === 'entering') return EYES_SPEED;
    if (ch.state === 'house' || ch.state === 'leaving') return HOUSE_SPEED;
    if (ch.y === TUNNEL_ROW && (ch.x < 5 || ch.x > COLS - 6)) return TUNNEL_SPEED;
    if (ch.scared) return SCARED_SPEED;
    return Math.min(CHASER_SPEED + CHASER_SPEED_STEP * (this.level - 1), CHASER_SPEED_MAX);
  }

  private moveChaser(ch: Chaser, dt: number): void {
    let dist = this.chaserSpeed(ch) * dt;
    switch (ch.state) {
      case 'house':
        if (this.clock - this.roundStart >= ch.releaseAt) ch.state = 'leaving';
        return;
      case 'leaving': {
        // Slide to the door column, then straight up and out.
        if (ch.x !== HOUSE_EXIT.x) {
          const dx = HOUSE_EXIT.x - ch.x;
          ch.x += Math.sign(dx) * Math.min(Math.abs(dx), dist);
          return;
        }
        ch.y = Math.max(HOUSE_EXIT.y, ch.y - dist);
        if (ch.y === HOUSE_EXIT.y) {
          ch.state = 'active';
          ch.dir = Math.random() < 0.5 ? 'left' : 'right';
        }
        return;
      }
      case 'entering':
        ch.y = Math.min(HOUSE_Y, ch.y + dist);
        if (ch.y === HOUSE_Y) {
          ch.state = 'leaving';
          ch.scared = false;
        }
        return;
      default:
        this.advance(ch, dist, () => this.chaserAtCenter(ch));
    }
  }

  private chaserAtCenter(ch: Chaser): void {
    if (ch.state === 'eyes' && ch.x === HOUSE_EXIT.x && ch.y === HOUSE_EXIT.y) {
      ch.state = 'entering';
      ch.dir = null;
      return;
    }
    const back = ch.dir ? OPPOSITE[ch.dir] : null;
    const options = DIRS.filter((d) => d !== back && open(ch.x + VEC[d].x, ch.y + VEC[d].y));
    if (options.length === 0) {
      ch.dir = back;
      return;
    }
    if (ch.scared && ch.state === 'active') {
      ch.dir = Phaser.Utils.Array.GetRandom(options);
      return;
    }
    const target = this.targetFor(ch);
    let best = options[0];
    let bestDist = Infinity;
    for (const d of options) {
      const nx = ch.x + VEC[d].x;
      const ny = ch.y + VEC[d].y;
      const dist = (nx - target.x) ** 2 + (ny - target.y) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        best = d;
      }
    }
    ch.dir = best;
  }

  /** Each chaser reads the runner differently, which is what makes them hard to shake as a group. */
  private targetFor(ch: Chaser): { x: number; y: number } {
    if (ch.state === 'eyes') return HOUSE_EXIT;
    if (this.modeIndex < MODE_SCHEDULE.length && this.modeIndex % 2 === 0) return ch.corner;
    const r = { x: Math.round(this.runner.x), y: Math.round(this.runner.y) };
    const f = VEC[this.facing];
    switch (ch.kind) {
      case 'hunter':
        return r;
      case 'ambusher':
        return { x: r.x + f.x * 4, y: r.y + f.y * 4 };
      case 'flanker': {
        const hunter = this.chasers[0];
        const pivot = { x: r.x + f.x * 2, y: r.y + f.y * 2 };
        return { x: pivot.x * 2 - hunter.x, y: pivot.y * 2 - hunter.y };
      }
      case 'drifter':
        return (ch.x - r.x) ** 2 + (ch.y - r.y) ** 2 > 64 ? r : ch.corner;
    }
  }

  private reverseChasers(): void {
    for (const ch of this.chasers) if (ch.state === 'active' && ch.dir) ch.dir = OPPOSITE[ch.dir];
  }

  // ---------------------------------------------------------------- eating and catching

  private eatAt(x: number, y: number): void {
    const key = y * COLS + x;
    const kind = this.dots.get(key);
    if (!kind) {
      if (this.bonus && x === BONUS_CELL.x && y === BONUS_CELL.y) this.eatBonus();
      return;
    }
    this.dots.delete(key);
    this.dotsEaten++;
    if (kind === 'power') {
      this.addScore(POINTS_POWER);
      this.scare();
    } else {
      this.addScore(POINTS_DOT);
      tone({ freq: this.dotsEaten % 2 ? 620 : 520, duration: 0.04, type: 'triangle', volume: 0.04 });
    }
    if (BONUS_AT.includes(this.dotsEaten)) {
      const points = BONUS_POINTS[Math.min(this.level - 1, BONUS_POINTS.length - 1)];
      this.bonus = { until: this.clock + BONUS_TIME * 1000, points };
    }
    if (this.bonus && x === BONUS_CELL.x && y === BONUS_CELL.y) this.eatBonus();
  }

  private eatBonus(): void {
    if (!this.bonus) return;
    this.addScore(this.bonus.points);
    floatText(this, px(BONUS_CELL.x), py(BONUS_CELL.y) - 14, `+${this.bonus.points}`, NEON.purple, 12);
    this.burst.setParticleTint(NEON.purple);
    this.burst.explode(16, px(BONUS_CELL.x), py(BONUS_CELL.y));
    this.bonus = null;
    tone({ freq: 700, toFreq: 1400, duration: 0.15, type: 'square', volume: 0.06 });
  }

  private scare(): void {
    const secs = Math.max(SCARED_TIME_MIN, SCARED_TIME - SCARED_TIME_STEP * (this.level - 1));
    this.scaredUntil = this.clock + secs * 1000;
    this.catchStreak = 0;
    this.reverseChasers();
    for (const ch of this.chasers) if (ch.state !== 'eyes' && ch.state !== 'entering') ch.scared = true;
    tone({ freq: 200, toFreq: 800, duration: 0.3, type: 'sawtooth', volume: 0.06 });
  }

  private checkCatches(): void {
    const r = this.runner;
    for (const ch of this.chasers) {
      if (ch.state !== 'active') continue;
      const dx = Math.abs(ch.x - r.x);
      const near = Math.min(dx, COLS - dx) < 0.6 && Math.abs(ch.y - r.y) < 0.6;
      if (!near) continue;
      if (ch.scared) this.catchChaser(ch);
      else return this.die();
    }
  }

  private catchChaser(ch: Chaser): void {
    const points = POINTS_CHASER * 2 ** this.catchStreak;
    this.catchStreak++;
    if (this.catchStreak === 4) unlock('maze.sweep');
    this.addScore(points);
    ch.state = 'eyes';
    ch.scared = false;
    // Snap to the nearest center so the eyes can path home cleanly.
    ch.x = wrapX(Math.round(ch.x));
    ch.y = Math.round(ch.y);
    floatText(this, px(ch.x), py(ch.y) - 12, String(points), NEON.cyan, 12);
    this.burst.setParticleTint(ch.color);
    this.burst.explode(20, px(ch.x), py(ch.y));
    this.freezeUntil = this.clock + CATCH_FREEZE_MS;
    tone({ freq: 400, toFreq: 1600, duration: 0.2, type: 'square', volume: 0.07 });
  }

  private addScore(points: number): void {
    this.score += points;
    this.scoreText.setText(this.score.toLocaleString());
    if (this.score >= 10000) unlock('maze.score');
    if (!this.extraLifeGiven && this.score >= EXTRA_LIFE_AT) {
      this.extraLifeGiven = true;
      this.lives++;
      showBanner(this, 'EXTRA LIFE', NEON.green, py(BONUS_CELL.y));
      tone({ freq: 880, toFreq: 1320, duration: 0.3, type: 'triangle', volume: 0.08 });
    }
  }

  private die(): void {
    this.setPhase('dying', DEATH_MS);
    this.bonus = null;
    this.cameras.main.shake(200, 0.01);
    this.burst.setParticleTint(NEON.yellow);
    this.burst.explode(40, px(this.runner.x), py(this.runner.y));
    noise(0.3, 0.1);
    tone({ freq: 700, toFreq: 80, duration: 0.9, type: 'sawtooth', volume: 0.07 });
  }

  private afterDeath(): void {
    this.lives--;
    if (this.lives > 0) {
      this.startRound();
      return;
    }
    this.setPhase('over');
    this.time.delayedCall(500, () =>
      this.scene.start('GameOver', { gameId: GAME_ID, score: this.score, detail: `REACHED LEVEL ${this.level}` }),
    );
  }

  private clearLevel(): void {
    unlock('maze.clear');
    this.setPhase('clearing', CLEAR_MS);
    this.bonus = null;
    [523, 659, 784, 1047].forEach((f, i) => this.time.delayedCall(i * 120, () => tone({ freq: f, duration: 0.16, type: 'triangle', volume: 0.08 })));
  }

  // ---------------------------------------------------------------- render

  /** Walls are outlined where they meet open floor, which traces the corridors as neon tubes. */
  private drawWalls(color: number): void {
    const g = this.walls.clear();
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (tile(x, y) === '#') g.fillStyle(color, 0.08).fillRect(GRID_X + x * CELL, GRID_Y + y * CELL, CELL, CELL);
      }
    }
    for (const [width, alpha] of [[7, 0.18], [2, 1]] as const) {
      g.lineStyle(width, color, alpha);
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          if (tile(x, y) !== '#') continue;
          const left = GRID_X + x * CELL;
          const top = GRID_Y + y * CELL;
          const floor = (nx: number, ny: number) => nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS && tile(nx, ny) !== '#';
          if (floor(x, y - 1)) g.lineBetween(left, top, left + CELL, top);
          if (floor(x, y + 1)) g.lineBetween(left, top + CELL, left + CELL, top + CELL);
          if (floor(x - 1, y)) g.lineBetween(left, top, left, top + CELL);
          if (floor(x + 1, y)) g.lineBetween(left + CELL, top, left + CELL, top + CELL);
        }
      }
    }
    // The house door.
    g.lineStyle(3, NEON.pink, 0.9).lineBetween(px(12) - CELL / 2, py(8), px(12) + CELL / 2, py(8));
  }

  private render(): void {
    const g = this.gfx.clear();
    const now = this.clock;

    if (this.phase === 'clearing') {
      const flash = Math.floor(now / 200) % 2 === 0;
      this.walls.setAlpha(flash ? 1 : 0.35);
    } else {
      this.walls.setAlpha(1);
    }

    for (const [key, kind] of this.dots) {
      const x = px(key % COLS);
      const y = py(Math.floor(key / COLS));
      if (kind === 'dot') {
        g.fillStyle(NEON.white, 0.85).fillRect(x - 2, y - 2, 4, 4);
      } else {
        const pulse = 0.6 + 0.4 * Math.abs(Math.sin(now / 180));
        g.fillStyle(NEON.yellow, 0.25 * pulse).fillCircle(x, y, 10);
        g.fillStyle(NEON.yellow, pulse).fillCircle(x, y, 6);
      }
    }

    if (this.bonus) {
      const x = px(BONUS_CELL.x);
      const y = py(BONUS_CELL.y);
      const s = 8 + Math.sin(now / 120) * 1.5;
      g.fillStyle(NEON.purple, 0.3).fillCircle(x, y, 13);
      g.fillStyle(NEON.purple, 1).fillPoints([{ x, y: y - s }, { x: x + s, y }, { x, y: y + s }, { x: x - s, y }], true);
      g.fillStyle(NEON.white, 0.9).fillRect(x - 2, y - 2, 4, 4);
    }

    const hideChasers = this.phase === 'dying' && now > this.phaseUntil - DEATH_MS + 300;
    if (!hideChasers && this.phase !== 'clearing') for (const ch of this.chasers) this.drawChaser(g, ch, now);
    this.drawRunner(g, now);
    this.drawLives(g);
  }

  private drawRunner(g: Phaser.GameObjects.Graphics, now: number): void {
    const r = this.runner;
    const x = px(r.x);
    const y = py(r.y);
    let radius = 9;
    if (this.phase === 'dying') radius *= Math.max(0, (this.phaseUntil - now) / DEATH_MS);
    else if (this.phase === 'over') return;
    else if (r.dir && this.phase === 'play') radius += Math.sin(now / 50) * 0.8;
    if (radius <= 0.2) return;
    g.fillStyle(NEON.yellow, 0.25).fillCircle(x, y, radius + 5);
    g.fillStyle(NEON.yellow, 1).fillCircle(x, y, radius);
    // A visor that looks where it is heading.
    const f = VEC[this.facing];
    g.fillStyle(NEON.bg, 1).fillCircle(x + f.x * radius * 0.45, y + f.y * radius * 0.45, radius * 0.3);
  }

  private drawChaser(g: Phaser.GameObjects.Graphics, ch: Chaser, now: number): void {
    const x = px(ch.x);
    const y = py(ch.y) + (ch.state === 'house' ? Math.sin(now / 200 + ch.homeX) * 3 : 0);
    const look = ch.dir ? VEC[ch.dir] : { x: 0, y: 0 };
    if (ch.state !== 'eyes' && ch.state !== 'entering') {
      let color = ch.color;
      if (ch.scared) {
        const warn = this.scaredUntil - now < SCARED_WARN * 1000 && Math.floor(now / 160) % 2 === 0;
        color = warn ? NEON.white : NEON.blue;
      }
      g.fillStyle(color, 0.22).fillRoundedRect(x - 13, y - 13, 26, 26, 8);
      g.fillStyle(color, 1).fillRoundedRect(x - 9, y - 9, 18, 18, 5);
      if (ch.scared) {
        // A worried zigzag mouth instead of eyes.
        g.lineStyle(2, NEON.bg, 1).beginPath();
        g.moveTo(x - 6, y + 3);
        for (let i = 1; i <= 4; i++) g.lineTo(x - 6 + i * 3, y + (i % 2 ? 0 : 3));
        g.strokePath();
        g.fillStyle(NEON.bg, 1).fillRect(x - 5, y - 5, 3, 3).fillRect(x + 2, y - 5, 3, 3);
        return;
      }
    }
    for (const ex of [-4, 4]) {
      g.fillStyle(NEON.white, 1).fillCircle(x + ex, y - 2, 3.5);
      g.fillStyle(NEON.bg, 1).fillCircle(x + ex + look.x * 1.6, y - 2 + look.y * 1.6, 1.8);
    }
  }

  private drawLives(g: Phaser.GameObjects.Graphics): void {
    // The life in play is not shown as a spare.
    const shown = Math.min(this.lives - 1, 6);
    for (let i = 0; i < shown; i++) {
      const x = GRID_X + COLS * CELL - 10 - i * 26;
      g.fillStyle(NEON.yellow, 1).fillCircle(x, 44, 8);
      g.fillStyle(NEON.bg, 1).fillCircle(x - 3.5, 44, 2.4);
    }
  }
}
