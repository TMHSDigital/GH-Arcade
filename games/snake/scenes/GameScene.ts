import Phaser from 'phaser';
import {
  BONUS_EVERY,
  BONUS_LIFETIME_MS,
  CELL,
  COLS,
  FIELD_TOP,
  GAME_ID,
  HEIGHT,
  ROUNDS_TO_WIN,
  ROWS,
  START_LENGTH,
  START_STEP_MS,
  VERSUS_STEP_MS,
  WIDTH,
} from '../config';
import { advance, bonusPoints, type Cell, type DirName, DIRS, foodPoints, freeCells, nextStepMs, queueTurn, resolveStep, same } from '../logic';
import { getHighScore, trophiesFor } from '../../../shared/achievements';
import { ArcadeControls } from '../../../shared/controls';
import { PauseController } from '../../../shared/pause';
import { dailyResult, dailyRng, dailySeed, getDailyBest, type Rng } from '../../../shared/rng';
import { endRun, showMatchResult } from '../../../shared/scenes';
import { noise, tone } from '../../../shared/sfx';
import { isTouchDevice, onSwipe } from '../../../shared/touch';
import { burstEmitter, fadeToScene, floatText, hex, HUD_STYLE, NEON, neonText, showBanner } from '../../../shared/ui';
import type { TROPHIES } from '../trophies';

const { reach, unlock } = trophiesFor<typeof TROPHIES>();

interface Player {
  id: 1 | 2;
  segments: Cell[];
  /** Where each segment was before the last step, for smooth interpolation. */
  prev: Cell[];
  dir: Cell;
  queue: Cell[];
  alive: boolean;
  dissolved: number;
  /** Head and tail colors of the gradient. */
  colors: [number, number];
  controls: ArcadeControls;
}

export interface SnakeGameData {
  /** 2 starts a versus match on one keyboard or two gamepads. */
  players?: 1 | 2;
  /** Solo only: play today's daily challenge, where the food and bonus stars are seeded from the date. */
  daily?: boolean;
  /** Versus only: round wins so far and the round number. */
  wins?: [number, number];
  round?: number;
}

const cellX = (x: number) => x * CELL + CELL / 2;
const cellY = (y: number) => FIELD_TOP + y * CELL + CELL / 2;

function starPoints(cx: number, cy: number, points: number, outer: number, inner: number, rotation: number): Phaser.Math.Vector2[] {
  const out: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rotation - Math.PI / 2 + (i * Math.PI) / points;
    out.push(new Phaser.Math.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
  }
  return out;
}

/** A straight snake with its head at (x, y), trailing away from `dir`. */
function line(x: number, y: number, dir: Cell): Cell[] {
  return Array.from({ length: START_LENGTH }, (_, i) => ({ x: x - dir.x * i, y: y - dir.y * i }));
}

export class GameScene extends Phaser.Scene {
  private versus = false;
  /** The UTC date of the daily challenge being played, or null in a normal game. */
  private daily: string | null = null;
  /** Daily challenge only: the seeded generator that places food and bonus stars. */
  private cellRng: Rng | null = null;
  private readonly gradients = new Map<number, number[]>();
  private wins: [number, number] = [0, 0];
  private round = 1;
  private players: Player[] = [];
  private stepMs = START_STEP_MS;
  private acc = 0;
  private elapsed = 0;
  private started = false;
  private over = false;

  private food!: Cell;
  private bonus: { cell: Cell; expiresAt: number } | null = null;
  private eaten = 0;
  private score = 0;

  private body!: Phaser.GameObjects.Graphics;
  private items!: Phaser.GameObjects.Graphics;
  private burst!: Phaser.GameObjects.Particles.ParticleEmitter;
  private scoreText!: Phaser.GameObjects.Text;
  private lengthText!: Phaser.GameObjects.Text;
  private hint?: Phaser.GameObjects.Text;
  private pause!: PauseController;

  constructor() {
    super('Game');
  }

  init(data: SnakeGameData): void {
    this.versus = data.players === 2;
    // Daily challenge (solo): food and bonus stars are seeded from the date, so everyone who steers
    // the same way gets the same game today.
    this.daily = data.daily && !this.versus ? dailySeed() : null;
    this.cellRng = this.daily ? dailyRng(GAME_ID, this.daily) : null;
    this.wins = data.wins ?? [0, 0];
    this.round = data.round ?? 1;
    this.players = [];
    this.stepMs = this.versus ? VERSUS_STEP_MS : START_STEP_MS;
    this.acc = 0;
    this.elapsed = 0;
    this.started = false;
    this.over = false;
    this.bonus = null;
    this.eaten = 0;
    this.score = 0;
    this.hint = undefined;
  }

  create(): void {
    this.cameras.main.fadeIn(250, 5, 5, 13);
    this.drawField();
    this.items = this.add.graphics();
    this.body = this.add.graphics();
    this.burst = burstEmitter(this, 260);

    const midY = Math.floor(ROWS / 2);
    if (this.versus) {
      this.players = [
        this.makePlayer(1, line(8, midY - 4, DIRS.right), DIRS.right, [NEON.green, NEON.cyan]),
        this.makePlayer(2, line(COLS - 9, midY + 4, DIRS.left), DIRS.left, [NEON.pink, NEON.orange]),
      ];
    } else {
      this.players = [this.makePlayer(undefined, line(Math.floor(COLS / 3), midY, DIRS.right), DIRS.right, [NEON.green, NEON.cyan])];
    }
    this.food = this.randomFreeCell();

    this.pause = new PauseController(
      this,
      this.players.map((p) => p.controls),
      // Restart begins a fresh match rather than replaying the current round.
      { canPause: () => !this.over, restartData: { players: this.versus ? 2 : 1, daily: this.daily !== null } },
    );
    this.createHud();

    if (this.versus) {
      // Each player swipes on their own half of the screen.
      onSwipe(this, (d) => d !== 'tap' && this.turn(this.players[0], d), { continuous: true, threshold: 22, region: new Phaser.Geom.Rectangle(0, 0, WIDTH / 2, HEIGHT) });
      onSwipe(this, (d) => d !== 'tap' && this.turn(this.players[1], d), { continuous: true, threshold: 22, region: new Phaser.Geom.Rectangle(WIDTH / 2, 0, WIDTH / 2, HEIGHT) });
      showBanner(this, `ROUND ${this.round}`, NEON.cyan);
      this.time.delayedCall(1300, () => this.begin());
    } else {
      onSwipe(this, (d) => d !== 'tap' && this.turn(this.players[0], d), { continuous: true, threshold: 22 });
      // Nothing moves until the player picks a direction; after a few seconds, start anyway.
      this.time.delayedCall(4000, () => this.begin());
    }
  }

  private makePlayer(seat: 1 | 2 | undefined, segments: Cell[], dir: Cell, colors: [number, number]): Player {
    return {
      id: seat ?? 1,
      segments,
      prev: segments.map((c) => ({ ...c })),
      dir,
      queue: [],
      alive: true,
      dissolved: 0,
      colors,
      controls: new ArcadeControls(this, undefined, seat ? { player: seat } : {}),
    };
  }

  private drawField(): void {
    const g = this.add.graphics().setDepth(-5);
    g.lineStyle(1, NEON.purple, 0.07);
    for (let x = 0; x <= COLS; x++) g.lineBetween(x * CELL, FIELD_TOP, x * CELL, HEIGHT);
    for (let y = 0; y <= ROWS; y++) g.lineBetween(0, FIELD_TOP + y * CELL, WIDTH, FIELD_TOP + y * CELL);
    g.lineStyle(2, NEON.cyan, 0.6).strokeRect(1, FIELD_TOP + 1, WIDTH - 2, ROWS * CELL - 2);
    if (this.versus) g.lineStyle(1, NEON.white, 0.06).lineBetween(WIDTH / 2, FIELD_TOP, WIDTH / 2, HEIGHT);
  }

  private createHud(): void {
    const style = HUD_STYLE;
    if (this.versus) {
      const [p1, p2] = this.players;
      this.add.text(20, FIELD_TOP / 2, 'P1', { ...style, fontSize: '14px', color: hex(p1.colors[0]) }).setOrigin(0, 0.5);
      this.add.text(WIDTH - 20, FIELD_TOP / 2, 'P2', { ...style, fontSize: '14px', color: hex(p2.colors[0]) }).setOrigin(1, 0.5);
      // Round-win pips: filled for rounds won, outlined for rounds still needed.
      const pips = this.add.graphics();
      for (let i = 0; i < ROUNDS_TO_WIN; i++) {
        const drawPip = (x: number, color: number, won: boolean) => {
          if (won) pips.fillStyle(color, 1).fillCircle(x, FIELD_TOP / 2, 6);
          else pips.lineStyle(2, color, 0.6).strokeCircle(x, FIELD_TOP / 2, 5);
        };
        drawPip(66 + i * 18, p1.colors[0], i < this.wins[0]);
        drawPip(WIDTH - 66 - i * 18, p2.colors[0], i < this.wins[1]);
      }
      this.scoreText = this.add.text(WIDTH / 2, FIELD_TOP / 2, `FIRST TO ${ROUNDS_TO_WIN}`, { ...style, fontSize: '10px', color: '#8a8ab8' }).setOrigin(0.5);
      this.lengthText = this.add.text(0, 0, '').setVisible(false);
      const help = isTouchDevice() ? 'SWIPE ON YOUR HALF OF THE SCREEN' : 'P1: WASD / PAD 1     P2: ARROWS / PAD 2';
      this.hint = neonText(this, WIDTH / 2, HEIGHT - 30, help, 10, NEON.white).setAlpha(0.8);
      return;
    }
    this.scoreText = this.add.text(WIDTH / 2, FIELD_TOP / 2, '0', style).setOrigin(0.5);
    this.lengthText = this.add.text(WIDTH - 20, FIELD_TOP / 2, '', { ...style, fontSize: '12px' }).setOrigin(1, 0.5);
    this.add
      .text(WIDTH / 2 + 110, FIELD_TOP / 2, this.bestLine(), { ...style, fontSize: '10px', color: hex(NEON.yellow) })
      .setOrigin(0, 0.5);
    if (this.daily) this.add.text(20, FIELD_TOP / 2, `DAILY ${this.daily}`, { ...style, fontSize: '10px', color: hex(NEON.yellow) }).setOrigin(0, 0.5);
    this.hint = neonText(this, WIDTH / 2, FIELD_TOP + 90, 'PRESS A DIRECTION OR SWIPE', 12, NEON.white);
    this.tweens.add({ targets: this.hint, alpha: 0.25, duration: 600, yoyo: true, repeat: -1 });
    this.updateHud();
  }

  // ---------------------------------------------------------------- input

  private turn(p: Player, name: DirName): void {
    if (!p.alive || this.over || this.pause.isPaused) return;
    // Repeats, reversals into your own neck and presses beyond the buffer are ignored.
    queueTurn(p.queue, p.dir, DIRS[name]);
    // In solo play the first input starts the game; versus rounds start on a timer.
    if (!this.versus) this.begin();
  }

  private begin(): void {
    if (this.started || this.over) return;
    this.started = true;
    if (!this.versus) this.hint?.destroy();
  }

  // ---------------------------------------------------------------- loop

  update(_time: number, delta: number): void {
    if (this.pause.isPaused) return;
    for (const p of this.players) {
      for (const name of Object.keys(DIRS) as DirName[]) if (p.controls.justPressed(name)) this.turn(p, name);
    }

    this.elapsed += delta;
    if (this.started && !this.over) {
      this.acc += delta;
      while (this.acc >= this.stepMs && !this.over) {
        this.acc -= this.stepMs;
        this.step();
      }
      if (this.bonus && this.elapsed > this.bonus.expiresAt) this.bonus = null;
    }
    this.render(this.started && !this.over ? Math.min(this.acc / this.stepMs, 1) : 1);
  }

  /** Moves every living snake one cell and resolves all collisions together. */
  private step(): void {
    const alive = this.players.filter((p) => p.alive);
    for (const p of alive) {
      const next = p.queue.shift();
      if (next) p.dir = next;
    }
    // The rules (walls, bodies, head-on meetings, growth) live in ../logic.
    const moves = resolveStep(alive, this.food);

    alive.forEach((p, i) => {
      const m = moves[i];
      if (m.crashed) return;
      const old = p.segments;
      p.prev = old.map((c) => ({ ...c }));
      p.segments = advance(old, m.head, m.grows);
      if (m.grows) p.prev.push({ ...old[old.length - 1] });
      if (m.grows) this.eatFood(p);
      if (this.bonus && same(m.head, this.bonus.cell)) this.eatBonus();
    });

    const crashed = alive.filter((_, i) => moves[i].crashed);
    if (crashed.length) this.crash(crashed);
  }

  private eatFood(p: Player): void {
    this.eaten++;
    const x = cellX(this.food.x);
    const y = cellY(this.food.y);
    this.stepMs = nextStepMs(this.stepMs);
    this.burst.setParticleTint(p.colors[0]);
    this.burst.explode(14, x, y);
    tone({ freq: 520 + Math.min(this.eaten, 30) * 12, toFreq: 880 + Math.min(this.eaten, 30) * 12, duration: 0.08, type: 'triangle', volume: 0.08 });
    if (!this.versus) {
      const points = foodPoints(this.eaten);
      this.score += points;
      floatText(this, x, y - 10, `+${points}`, NEON.pink);
      reach('snake.len25', p.segments.length);
      reach('snake.len50', p.segments.length);
    }
    this.food = this.randomFreeCell();
    // Bonus stars are a solo-mode scoring feature.
    if (!this.versus && this.eaten % BONUS_EVERY === 0) this.bonus = { cell: this.randomFreeCell(), expiresAt: this.elapsed + BONUS_LIFETIME_MS };
    this.updateHud();
  }

  private eatBonus(): void {
    if (!this.bonus) return;
    const points = bonusPoints(this.bonus.expiresAt - this.elapsed);
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

  private crash(dead: Player[]): void {
    this.cameras.main.shake(260, 0.012);
    this.cameras.main.flash(200, 255, 46, 151);
    noise(0.4, 0.12);
    tone({ freq: 320, toFreq: 50, duration: 0.6, type: 'sawtooth', volume: 0.08 });
    for (const p of dead) {
      p.alive = false;
      this.dissolve(p);
    }
    const longest = Math.max(...dead.map((p) => p.segments.length));
    const dissolveMs = 250 + longest * 35;

    if (!this.versus) {
      this.over = true;
      this.bonus = null;
      const p = this.players[0];
      const detail = this.daily ? dailyResult(GAME_ID, this.score, this.daily) : `LENGTH ${p.segments.length}`;
      endRun(this, { gameId: GAME_ID, score: this.score, detail, daily: this.daily ?? undefined }, dissolveMs + 700);
      return;
    }

    // Versus: the round ends as soon as anyone crashes. Survivors win it; a double crash is a draw.
    this.over = true;
    const survivors = this.players.filter((p) => p.alive);
    const winner = survivors.length === 1 ? survivors[0] : null;
    if (winner) this.wins[winner.id - 1]++;
    this.time.delayedCall(Math.max(dissolveMs, 900), () => {
      if (winner && this.wins[winner.id - 1] >= ROUNDS_TO_WIN) this.matchOver(winner);
      else {
        showBanner(this, winner ? `P${winner.id} TAKES THE ROUND` : 'DRAW', winner ? winner.colors[0] : NEON.white);
        this.time.delayedCall(1400, () => fadeToScene(this, 'Game', { players: 2, wins: this.wins, round: this.round + 1 }));
      }
    });
  }

  private dissolve(p: Player): void {
    const total = p.segments.length;
    p.segments.forEach((c, i) => {
      this.time.delayedCall(250 + i * 35, () => {
        p.dissolved = i + 1;
        this.burst.setParticleTint(this.segmentColor(p, i, total));
        this.burst.explode(6, cellX(c.x), cellY(c.y));
        if (i % 3 === 0) tone({ freq: 200 + (total - i) * 8, duration: 0.03, volume: 0.03 });
      });
    });
  }

  private matchOver(winner: Player): void {
    const controls = this.players.map((p) => p.controls);
    showMatchResult(this, controls, {
      gameId: GAME_ID,
      title: `PLAYER ${winner.id} WINS!`,
      color: winner.colors[0],
      tally: `${this.wins[0]} - ${this.wins[1]}`,
      rematchData: { players: 2 },
    });
  }

  // ---------------------------------------------------------------- render

  /**
   * The head-to-tail gradient for a snake of a given length. It only changes when the snake grows,
   * so it is computed once per length instead of allocating three color objects per segment per frame.
   */
  private gradient(p: Player, total: number): number[] {
    const cached = this.gradients.get(p.id);
    if (cached && cached.length === total) return cached;
    const from = Phaser.Display.Color.ValueToColor(p.colors[0]);
    const to = Phaser.Display.Color.ValueToColor(p.colors[1]);
    const colors = Array.from({ length: total }, (_, i) => {
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(from, to, Math.max(total - 1, 1), i);
      return Phaser.Display.Color.GetColor(c.r, c.g, c.b);
    });
    this.gradients.set(p.id, colors);
    return colors;
  }

  private segmentColor(p: Player, i: number, total: number): number {
    const colors = this.gradient(p, total);
    return colors[Math.min(i, colors.length - 1)];
  }

  private render(t: number): void {
    const items = this.items.clear();
    const pulse = 1 + Math.sin(this.elapsed / 180) * 0.12;
    const fx = cellX(this.food.x);
    const fy = cellY(this.food.y);
    // Versus food is yellow so it doesn't match either player's colors.
    const foodColor = this.versus ? NEON.yellow : NEON.pink;
    items.fillStyle(foodColor, 0.18).fillCircle(fx, fy, 14 * pulse);
    items.fillStyle(foodColor, 1).fillCircle(fx, fy, 7 * pulse);

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
    for (const p of this.players) {
      const total = p.segments.length;
      const lerp = p.alive ? t : 1;
      for (let i = total - 1; i >= p.dissolved; i--) {
        const cur = p.segments[i];
        const from = p.prev[i] ?? cur;
        const x = Phaser.Math.Linear(from.x, cur.x, lerp) * CELL;
        const y = FIELD_TOP + Phaser.Math.Linear(from.y, cur.y, lerp) * CELL;
        const color = this.segmentColor(p, i, total);
        const inset = i === 0 ? 1 : 3;
        g.fillStyle(color, 0.16).fillRoundedRect(x - 3, y - 3, CELL + 6, CELL + 6, 8);
        g.fillStyle(color, 1).fillRoundedRect(x + inset, y + inset, CELL - inset * 2, CELL - inset * 2, i === 0 ? 7 : 5);
        if (i === 0) this.drawEyes(g, p, x, y);
      }
    }
  }

  private drawEyes(g: Phaser.GameObjects.Graphics, p: Player, x: number, y: number): void {
    const cx = x + CELL / 2 + p.dir.x * 4;
    const cy = y + CELL / 2 + p.dir.y * 4;
    const px = -p.dir.y * 5;
    const py = p.dir.x * 5;
    g.fillStyle(NEON.bg, 1).fillCircle(cx + px, cy + py, 3).fillCircle(cx - px, cy - py, 3);
  }

  private updateHud(): void {
    if (this.versus) return;
    reach('snake.score', this.score);
    this.scoreText.setText(this.score.toLocaleString());
    this.lengthText.setText(`LEN ${this.players[0].segments.length}`);
  }

  private randomFreeCell(): Cell {
    const taken = this.players.flatMap((p) => p.segments);
    if (this.food) taken.push(this.food);
    if (this.bonus) taken.push(this.bonus.cell);
    const free = freeCells(taken);
    return this.cellRng ? this.cellRng.pick(free) : Phaser.Utils.Array.GetRandom(free);
  }

  /** The line beside the score: the best score, or today's best in a daily challenge. */
  private bestLine(): string {
    const best = this.daily ? getDailyBest(GAME_ID, this.daily) : getHighScore(GAME_ID);
    return `${this.daily ? "TODAY'S BEST" : 'BEST'} ${best.toLocaleString()}`;
  }
}
