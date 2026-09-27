import Phaser from 'phaser';
import {
  BONUS_BASE_POINTS,
  BONUS_EVERY,
  BONUS_LIFETIME_MS,
  CELL,
  COLS,
  FIELD_TOP,
  FOOD_POINTS,
  GAME_ID,
  HEIGHT,
  MIN_STEP_MS,
  ROWS,
  START_LENGTH,
  START_STEP_MS,
  STEP_SPEEDUP_MS,
  TURN_BUFFER,
  WIDTH,
} from '../config';
import { unlock } from '../../../shared/achievements';
import { ArcadeControls } from '../../../shared/controls';
import { PauseController } from '../../../shared/pause';
import { noise, tone } from '../../../shared/sfx';
import { getHighScore } from '../../../shared/storage';
import { onSwipe } from '../../../shared/touch';
import { burstEmitter, floatText, hex, NEON, neonText, PIXEL_FONT } from '../../../shared/ui';

interface Cell {
  x: number;
  y: number;
}

const DIRS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
} as const;
type DirName = keyof typeof DIRS;

const same = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;

function starPoints(cx: number, cy: number, points: number, outer: number, inner: number, rotation: number): Phaser.Math.Vector2[] {
  const out: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rotation - Math.PI / 2 + (i * Math.PI) / points;
    out.push(new Phaser.Math.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
  }
  return out;
}
const cellX = (x: number) => x * CELL + CELL / 2;
const cellY = (y: number) => FIELD_TOP + y * CELL + CELL / 2;

export class GameScene extends Phaser.Scene {
  private segments: Cell[] = [];
  /** Where each segment was before the last step, for smooth interpolation. */
  private prev: Cell[] = [];
  private dir: Cell = DIRS.right;
  private queue: Cell[] = [];
  private stepMs = START_STEP_MS;
  private acc = 0;
  private elapsed = 0;
  private started = false;
  private alive = true;
  private dissolved = 0;

  private food!: Cell;
  private bonus: { cell: Cell; expiresAt: number } | null = null;
  private eaten = 0;
  private score = 0;

  private body!: Phaser.GameObjects.Graphics;
  private items!: Phaser.GameObjects.Graphics;
  private burst!: Phaser.GameObjects.Particles.ParticleEmitter;
  private scoreText!: Phaser.GameObjects.Text;
  private lengthText!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private controls!: ArcadeControls;
  private pause!: PauseController;

  constructor() {
    super('Game');
  }

  init(): void {
    const midY = Math.floor(ROWS / 2);
    const startX = Math.floor(COLS / 3);
    this.segments = Array.from({ length: START_LENGTH }, (_, i) => ({ x: startX - i, y: midY }));
    this.prev = this.segments.map((c) => ({ ...c }));
    this.dir = DIRS.right;
    this.queue = [];
    this.stepMs = START_STEP_MS;
    this.acc = 0;
    this.elapsed = 0;
    this.started = false;
    this.alive = true;
    this.dissolved = 0;
    this.bonus = null;
    this.eaten = 0;
    this.score = 0;
  }

  create(): void {
    this.cameras.main.fadeIn(250, 5, 5, 13);
    this.drawField();
    this.items = this.add.graphics();
    this.body = this.add.graphics();
    this.burst = burstEmitter(this, 260);
    this.food = this.randomFreeCell();

    const style = { fontFamily: PIXEL_FONT, fontSize: '16px', color: '#e8e8ff' };
    this.scoreText = this.add.text(WIDTH / 2, FIELD_TOP / 2, '0', style).setOrigin(0.5);
    this.lengthText = this.add.text(WIDTH - 20, FIELD_TOP / 2, '', { ...style, fontSize: '12px' }).setOrigin(1, 0.5);
    this.add
      .text(WIDTH / 2 + 110, FIELD_TOP / 2, `BEST ${getHighScore(GAME_ID).toLocaleString()}`, {
        ...style,
        fontSize: '10px',
        color: hex(NEON.yellow),
      })
      .setOrigin(0, 0.5);
    this.hint = neonText(this, WIDTH / 2, FIELD_TOP + 90, 'PRESS A DIRECTION OR SWIPE', 12, NEON.white);
    this.tweens.add({ targets: this.hint, alpha: 0.25, duration: 600, yoyo: true, repeat: -1 });
    this.updateHud();

    this.controls = new ArcadeControls(this);
    this.pause = new PauseController(this, this.controls, { canPause: () => this.alive });
    onSwipe(this, (d) => d !== 'tap' && this.turn(d), { continuous: true, threshold: 22 });
    // Nothing moves until the player picks a direction; after a few seconds, start anyway.
    this.time.delayedCall(4000, () => this.begin());
  }

  private drawField(): void {
    const g = this.add.graphics().setDepth(-5);
    g.lineStyle(1, NEON.purple, 0.07);
    for (let x = 0; x <= COLS; x++) g.lineBetween(x * CELL, FIELD_TOP, x * CELL, HEIGHT);
    for (let y = 0; y <= ROWS; y++) g.lineBetween(0, FIELD_TOP + y * CELL, WIDTH, FIELD_TOP + y * CELL);
    g.lineStyle(2, NEON.cyan, 0.6).strokeRect(1, FIELD_TOP + 1, WIDTH - 2, ROWS * CELL - 2);
  }

  // ---------------------------------------------------------------- input

  private turn(name: DirName): void {
    if (!this.alive || this.pause.isPaused) return;
    const d = DIRS[name];
    const last = this.queue.at(-1) ?? this.dir;
    // Ignore repeats and 180-degree reversals into your own neck.
    if (same(d, last) || (d.x === -last.x && d.y === -last.y)) {
      this.begin();
      return;
    }
    if (this.queue.length < TURN_BUFFER) this.queue.push(d);
    this.begin();
  }

  private begin(): void {
    if (this.started || !this.alive) return;
    this.started = true;
    this.hint.destroy();
  }

  // ---------------------------------------------------------------- loop

  update(_time: number, delta: number): void {
    if (this.pause.isPaused) return;
    for (const name of Object.keys(DIRS) as DirName[]) if (this.controls.justPressed(name)) this.turn(name);

    this.elapsed += delta;
    if (this.alive && this.started) {
      this.acc += delta;
      while (this.acc >= this.stepMs && this.alive) {
        this.acc -= this.stepMs;
        this.step();
      }
      if (this.bonus && this.elapsed > this.bonus.expiresAt) this.bonus = null;
    }
    this.render(this.alive && this.started ? Math.min(this.acc / this.stepMs, 1) : 1);
  }

  private step(): void {
    const next = this.queue.shift();
    if (next) this.dir = next;
    const head = this.segments[0];
    const nh = { x: head.x + this.dir.x, y: head.y + this.dir.y };
    const eatsFood = same(nh, this.food);
    const eatsBonus = !!this.bonus && same(nh, this.bonus.cell);
    const grows = eatsFood;

    const hitsWall = nh.x < 0 || nh.x >= COLS || nh.y < 0 || nh.y >= ROWS;
    // The tail moves out of the way this step unless we're growing.
    const body = grows ? this.segments : this.segments.slice(0, -1);
    if (hitsWall || body.some((c) => same(c, nh))) {
      this.die();
      return;
    }

    const old = this.segments;
    this.prev = old.map((c) => ({ ...c }));
    this.segments = [nh, ...old];
    if (grows) this.prev.push({ ...old[old.length - 1] });
    else this.segments.pop();

    if (eatsFood) this.eatFood();
    if (eatsBonus) this.eatBonus();
  }

  private eatFood(): void {
    this.eaten++;
    const multiplier = 1 + Math.floor(this.eaten / 10);
    const points = FOOD_POINTS * multiplier;
    this.score += points;
    this.stepMs = Math.max(MIN_STEP_MS, this.stepMs - STEP_SPEEDUP_MS);
    const x = cellX(this.food.x);
    const y = cellY(this.food.y);
    this.burst.setParticleTint(NEON.pink);
    this.burst.explode(14, x, y);
    floatText(this, x, y - 10, `+${points}`, NEON.pink);
    tone({ freq: 520 + Math.min(this.eaten, 30) * 12, toFreq: 880 + Math.min(this.eaten, 30) * 12, duration: 0.08, type: 'triangle', volume: 0.08 });
    if (this.segments.length >= 25) unlock('snake.len25');
    if (this.segments.length >= 50) unlock('snake.len50');
    this.food = this.randomFreeCell();
    if (this.eaten % BONUS_EVERY === 0) this.bonus = { cell: this.randomFreeCell(), expiresAt: this.elapsed + BONUS_LIFETIME_MS };
    this.updateHud();
  }

  private eatBonus(): void {
    if (!this.bonus) return;
    const secondsLeft = Math.max(0, Math.ceil((this.bonus.expiresAt - this.elapsed) / 1000));
    const points = BONUS_BASE_POINTS + secondsLeft * 10;
    this.score += points;
    const x = cellX(this.bonus.cell.x);
    const y = cellY(this.bonus.cell.y);
    this.burst.setParticleTint(NEON.yellow);
    this.burst.explode(30, x, y);
    this.cameras.main.shake(80, 0.004);
    floatText(this, x, y - 10, `BONUS +${points}`, NEON.yellow, 14);
    [660, 880, 1320].forEach((f, i) => this.time.delayedCall(i * 70, () => tone({ freq: f, duration: 0.1, type: 'square', volume: 0.06 })));
    this.bonus = null;
    unlock('snake.bonus');
    this.updateHud();
  }

  private die(): void {
    this.alive = false;
    this.bonus = null;
    this.cameras.main.shake(260, 0.012);
    this.cameras.main.flash(200, 255, 46, 151);
    noise(0.4, 0.12);
    tone({ freq: 320, toFreq: 50, duration: 0.6, type: 'sawtooth', volume: 0.08 });

    // Dissolve the snake from head to tail.
    const total = this.segments.length;
    this.segments.forEach((c, i) => {
      this.time.delayedCall(250 + i * 35, () => {
        this.dissolved = i + 1;
        this.burst.setParticleTint(this.segmentColor(i, total));
        this.burst.explode(6, cellX(c.x), cellY(c.y));
        if (i % 3 === 0) tone({ freq: 200 + (total - i) * 8, duration: 0.03, volume: 0.03 });
      });
    });
    this.time.delayedCall(250 + total * 35 + 700, () =>
      this.scene.start('GameOver', { gameId: GAME_ID, score: this.score, detail: `LENGTH ${total}` }),
    );
  }

  // ---------------------------------------------------------------- render

  private segmentColor(i: number, total: number): number {
    const c = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(NEON.green),
      Phaser.Display.Color.ValueToColor(NEON.cyan),
      Math.max(total - 1, 1),
      i,
    );
    return Phaser.Display.Color.GetColor(c.r, c.g, c.b);
  }

  private render(t: number): void {
    const items = this.items.clear();
    const pulse = 1 + Math.sin(this.elapsed / 180) * 0.12;
    const fx = cellX(this.food.x);
    const fy = cellY(this.food.y);
    items.fillStyle(NEON.pink, 0.18).fillCircle(fx, fy, 14 * pulse);
    items.fillStyle(NEON.pink, 1).fillCircle(fx, fy, 7 * pulse);

    if (this.bonus) {
      const bx = cellX(this.bonus.cell.x);
      const by = cellY(this.bonus.cell.y);
      const left = Phaser.Math.Clamp((this.bonus.expiresAt - this.elapsed) / BONUS_LIFETIME_MS, 0, 1);
      // Blink during the last second and a half.
      if (left > 0.25 || Math.floor(this.elapsed / 120) % 2 === 0) {
        items.fillStyle(NEON.yellow, 0.2).fillCircle(bx, by, 16 * pulse);
        items.fillStyle(NEON.yellow, 1).fillPoints(starPoints(bx, by, 5, 11, 5, this.elapsed / 900), true);
        items.lineStyle(2, NEON.yellow, 0.8).beginPath();
        items.arc(bx, by, 17, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2).strokePath();
      }
    }

    const g = this.body.clear();
    const total = this.segments.length;
    for (let i = total - 1; i >= this.dissolved; i--) {
      const cur = this.segments[i];
      const from = this.prev[i] ?? cur;
      const x = Phaser.Math.Linear(from.x, cur.x, t) * CELL;
      const y = FIELD_TOP + Phaser.Math.Linear(from.y, cur.y, t) * CELL;
      const color = this.segmentColor(i, total);
      const inset = i === 0 ? 1 : 3;
      g.fillStyle(color, 0.16).fillRoundedRect(x - 3, y - 3, CELL + 6, CELL + 6, 8);
      g.fillStyle(color, 1).fillRoundedRect(x + inset, y + inset, CELL - inset * 2, CELL - inset * 2, i === 0 ? 7 : 5);
      if (i === 0) this.drawEyes(g, x, y);
    }
  }

  private drawEyes(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    const cx = x + CELL / 2 + this.dir.x * 4;
    const cy = y + CELL / 2 + this.dir.y * 4;
    const px = -this.dir.y * 5;
    const py = this.dir.x * 5;
    g.fillStyle(NEON.bg, 1).fillCircle(cx + px, cy + py, 3).fillCircle(cx - px, cy - py, 3);
  }

  private updateHud(): void {
    if (this.score >= 1000) unlock('snake.score');
    this.scoreText.setText(this.score.toLocaleString());
    this.lengthText.setText(`LEN ${this.segments.length}`);
  }

  private randomFreeCell(): Cell {
    const taken = new Set(this.segments.map((c) => `${c.x},${c.y}`));
    if (this.food) taken.add(`${this.food.x},${this.food.y}`);
    if (this.bonus) taken.add(`${this.bonus.cell.x},${this.bonus.cell.y}`);
    const free: Cell[] = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (!taken.has(`${x},${y}`)) free.push({ x, y });
    return Phaser.Utils.Array.GetRandom(free);
  }
}
