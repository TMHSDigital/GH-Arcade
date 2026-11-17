import Phaser from 'phaser';
import {
  BOARD_BOTTOM,
  BOARD_SIDE,
  BOARD_TOP,
  CURSOR_REPEAT_DELAY_MS,
  CURSOR_REPEAT_MS,
  DAILY_DIFFICULTY,
  type Difficulty,
  DIFFICULTIES,
  type DifficultyId,
  GAME_ID,
  HEIGHT,
  LONG_PRESS_MS,
  LOSS_END_DELAY_MS,
  MAX_CELL,
  MINE_CHAIN_MAX_MS,
  MINE_CHAIN_MS,
  REVEAL_MAX_MS,
  REVEAL_MS,
  REVEAL_STEP_MS,
  SPEED_TROPHY_SECONDS,
  WIDTH,
  WIN_END_DELAY_MS,
} from '../config';
import {
  type Board,
  canChord,
  clearedCells,
  createBoard,
  minesByDistance,
  minesLeft,
  moveCursor,
  type MoveResult,
  primary,
  reveal,
  seededBoard,
  toggleFlag,
  wrongFlags,
} from '../board';
import { EXTRA_CONTROLS } from '../controls';
import { formatTime, lossScore, saveClearTime, winScore } from '../scoring';
import { trophiesFor } from '../../../shared/achievements';
import { ArcadeControls } from '../../../shared/controls';
import { frameMs } from '../../../shared/frame';
import { PauseController } from '../../../shared/pause';
import { dailyOutcome, type DailyRun, dailyRunFrom } from '../../../shared/rng';
import { endRun, SCENE } from '../../../shared/scenes';
import { getSettings } from '../../../shared/settings';
import { noise, tone } from '../../../shared/sfx';
import { burstEmitter, dailyHudLabel, hex, hudText, impact, NEON, PIXEL_FONT, reducedMotion, showBanner } from '../../../shared/ui';
import type { TROPHIES } from '../trophies';

const { unlock } = trophiesFor<typeof TROPHIES>();

const NUMBER_COLORS = [0, NEON.cyan, NEON.green, NEON.pink, NEON.purple, NEON.orange, NEON.yellow, NEON.blue, NEON.white];
const LABEL_COLORS: Record<DifficultyId, number> = { easy: NEON.green, medium: NEON.yellow, hard: NEON.pink };
const HIDDEN_FILL = 0x121230;
const PRESSED_FILL = 0x23235a;
const OPEN_FILL = 0x07071a;
const HUD_Y = 32;

type Dir = 'left' | 'right' | 'up' | 'down';
const DIRS: Record<Dir, [number, number]> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

export class GameScene extends Phaser.Scene {
  private diff: Difficulty = DIFFICULTIES.easy;
  /** The daily challenge being played, or null in a normal game. */
  private daily: DailyRun | null = null;
  private board!: Board;

  /** Cell size and the board's top-left corner, in pixels. */
  private cell = 0;
  private ox = 0;
  private oy = 0;

  private cursor = 0;
  /** The cursor shows once a key or gamepad moves it, and hides again on a click or tap. */
  private cursorShown = false;
  private hover = -1;
  private heldDir: Dir | null = null;
  private repeatIn = 0;

  private flagMode = false;
  private placedFlag = false;
  /** The timer starts with the player's first move. */
  private started = false;
  private elapsedMs = 0;
  private shownSecond = -1;
  private finished = false;

  /** Scene time in ms that stops while paused; every animation is timed by it. */
  private clock = 0;
  /** When each cell's reveal flash starts, on `clock`. */
  private revealAt: number[] = [];
  private animUntil = 0;
  /** Numbers waiting for their cell's flash, in the order they appear. */
  private pending: number[] = [];
  private pendingHead = 0;
  private numbers: (Phaser.GameObjects.Image | undefined)[] = [];
  private detonated: boolean[] = [];
  private shownWrong: number[] = [];
  /** The win sweep: when it starts and ends on `clock`, or -1. */
  private winAt = -1;
  private winUntil = -1;
  private dirty = true;

  private press: { id: number; index: number; consumed: boolean } | null = null;
  private longPress: Phaser.Time.TimerEvent | null = null;

  private gfx!: Phaser.GameObjects.Graphics;
  private cursorGfx!: Phaser.GameObjects.Graphics;
  private burst!: Phaser.GameObjects.Particles.ParticleEmitter;
  private timeText!: Phaser.GameObjects.Text;
  private minesText!: Phaser.GameObjects.Text;
  private flagButton!: Phaser.GameObjects.Rectangle;
  private flagLabel!: Phaser.GameObjects.Text;
  private controls!: ArcadeControls<keyof typeof EXTRA_CONTROLS>;
  private pause!: PauseController;

  constructor() {
    super(SCENE.game);
  }

  init(data: { difficulty?: DifficultyId; daily?: boolean } = {}): void {
    // Daily challenge: one seeded board for everyone today, opened at the same starting cell.
    this.daily = dailyRunFrom(data, GAME_ID);
    const id = this.daily ? DAILY_DIFFICULTY : data.difficulty && data.difficulty in DIFFICULTIES ? data.difficulty : 'easy';
    this.diff = DIFFICULTIES[id];
    this.cursorShown = false;
    this.hover = -1;
    this.heldDir = null;
    this.flagMode = false;
    this.placedFlag = false;
    this.started = false;
    this.elapsedMs = 0;
    this.shownSecond = -1;
    this.finished = false;
    this.clock = 0;
    this.animUntil = 0;
    this.pending = [];
    this.pendingHead = 0;
    this.numbers = [];
    this.shownWrong = [];
    this.winAt = -1;
    this.winUntil = -1;
    this.dirty = true;
    this.press = null;
    this.longPress = null;
  }

  create(): void {
    this.cameras.main.fadeIn(250, 5, 5, 13);
    const { cols, rows } = this.diff;
    this.cell = Math.floor(Math.min(MAX_CELL, (WIDTH - 2 * BOARD_SIDE) / cols, (BOARD_BOTTOM - BOARD_TOP) / rows));
    this.ox = Math.floor((WIDTH - cols * this.cell) / 2);
    this.oy = BOARD_TOP + Math.floor((BOARD_BOTTOM - BOARD_TOP - rows * this.cell) / 2);
    // Draw the eight numbers now, so the first flood only places images.
    for (let n = 1; n < NUMBER_COLORS.length; n++) this.digitKey(n);

    let start = -1;
    if (this.daily) {
      const seeded = seededBoard(this.diff, this.daily.rng('board').next);
      this.board = seeded.board;
      start = seeded.start;
    } else {
      this.board = createBoard(this.diff);
    }
    const size = cols * rows;
    this.revealAt = new Array<number>(size).fill(0);
    this.detonated = new Array<boolean>(size).fill(false);
    this.cursor = start >= 0 ? start : Math.floor(rows / 2) * cols + Math.floor(cols / 2);

    this.drawFrame();
    this.gfx = this.add.graphics();
    this.cursorGfx = this.add.graphics().setDepth(5);
    if (!reducedMotion()) this.tweens.add({ targets: this.cursorGfx, alpha: 0.45, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.burst = burstEmitter(this, 320, 800);
    this.buildHud();

    this.controls = new ArcadeControls(this, EXTRA_CONTROLS);
    this.pause = new PauseController(this, this.controls, { canPause: () => !this.finished });
    this.bindPointer();

    // The daily board opens at its seeded start, so everyone begins from the same position.
    if (start >= 0) this.applyMove(reveal(this.board, start));
    this.updateHud();
  }

  // ---------------------------------------------------------------- setup

  private drawFrame(): void {
    const g = this.add.graphics().setDepth(-1);
    const w = this.diff.cols * this.cell;
    const h = this.diff.rows * this.cell;
    g.lineStyle(8, NEON.purple, 0.08).strokeRoundedRect(this.ox - 8, this.oy - 8, w + 16, h + 16, 10);
    g.lineStyle(2, NEON.purple, 0.7).strokeRoundedRect(this.ox - 5, this.oy - 5, w + 10, h + 10, 8);
  }

  private buildHud(): void {
    if (this.daily) dailyHudLabel(this, 20, 10, GAME_ID, this.daily, { depth: 10 });
    else
      hudText(this, 20, HUD_Y, this.diff.label, 14)
        .setOrigin(0, 0.5)
        .setColor(hex(LABEL_COLORS[this.diff.id]))
        .setDepth(10);
    this.timeText = hudText(this, WIDTH / 2 - 60, HUD_Y, '').setOrigin(0.5).setDepth(10);
    this.minesText = hudText(this, WIDTH / 2 + 110, HUD_Y, '').setOrigin(0.5).setDepth(10);

    // Flag mode makes a tap (or click, or Action) flag instead of reveal: the touch alternative to holding.
    const x = WIDTH - 95;
    this.flagButton = this.add
      .rectangle(x, HUD_Y, 150, 34, NEON.pink, 0.08)
      .setStrokeStyle(2, NEON.pink, 0.6)
      .setDepth(10)
      .setInteractive({ useHandCursor: true });
    this.flagLabel = this.add.text(x, HUD_Y, '', { fontFamily: PIXEL_FONT, fontSize: '10px', color: '#e8e8ff' }).setOrigin(0.5).setDepth(11);
    this.flagButton.on('pointerdown', () => {
      if (!this.pause.isPaused && !this.finished) this.toggleFlagMode();
    });
    this.refreshFlagButton();
  }

  private bindPointer(): void {
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.pause.isPaused || this.finished) return;
      const index = this.cellAt(p.x, p.y);
      if (index < 0) return;
      this.cursor = index;
      this.setCursorShown(false);
      if (p.rightButtonDown()) {
        this.flagAt(index);
        return;
      }
      this.press = { id: p.id, index, consumed: false };
      this.dirty = true;
      // Holding a finger on a cell flags it; a mouse has its right button for that.
      if (p.wasTouch) {
        this.longPress = this.time.delayedCall(LONG_PRESS_MS, () => {
          if (!this.press || this.press.index !== index || this.press.consumed) return;
          this.press.consumed = true;
          this.flagAt(index);
          if (getSettings().touch.haptics) {
            try {
              navigator.vibrate?.(15);
            } catch {
              /* vibration blocked or unsupported */
            }
          }
        });
      }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const index = this.cellAt(p.x, p.y);
      // Sliding off the cell cancels the press, as with a button.
      if (this.press && p.id === this.press.id && index !== this.press.index) this.cancelPress();
      const hover = p.wasTouch || this.finished ? -1 : index;
      if (hover !== this.hover) {
        this.hover = hover;
        this.drawCursor();
      }
    });
    const release = (p: Phaser.Input.Pointer) => {
      if (!this.press || p.id !== this.press.id) return;
      const { index, consumed } = this.press;
      this.cancelPress();
      if (consumed || this.pause.isPaused || this.finished || this.cellAt(p.x, p.y) !== index) return;
      if (this.flagMode && !this.board.revealed[index]) this.flagAt(index);
      else this.primaryAt(index);
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', (p: Phaser.Input.Pointer) => {
      if (this.press && p.id === this.press.id) this.cancelPress();
    });
  }

  private cancelPress(): void {
    this.press = null;
    this.longPress?.remove();
    this.longPress = null;
    this.dirty = true;
  }

  private cellAt(x: number, y: number): number {
    const c = Math.floor((x - this.ox) / this.cell);
    const r = Math.floor((y - this.oy) / this.cell);
    return c >= 0 && c < this.diff.cols && r >= 0 && r < this.diff.rows ? r * this.diff.cols + c : -1;
  }

  // ---------------------------------------------------------------- moves

  private primaryAt(index: number): void {
    const { board } = this;
    if (board.flagged[index] || (board.revealed[index] && !canChord(board, index))) {
      tone({ freq: 180, duration: 0.05, type: 'square', volume: 0.025 });
      return;
    }
    this.started = true;
    this.applyMove(primary(board, index));
  }

  private flagAt(index: number): void {
    if (!toggleFlag(this.board, index)) return;
    this.started = true;
    const flagged = this.board.flagged[index];
    if (flagged) this.placedFlag = true;
    tone({ freq: flagged ? 980 : 520, toFreq: flagged ? 1320 : 380, duration: 0.06, type: 'square', volume: 0.04 });
    if (flagged) {
      const [x, y] = this.centre(index);
      this.burst.setParticleTint(NEON.pink);
      this.burst.explode(6, x, y);
    }
    this.dirty = true;
    this.updateHud();
  }

  private toggleFlagMode(): void {
    this.flagMode = !this.flagMode;
    tone({ freq: this.flagMode ? 660 : 440, duration: 0.06, type: 'triangle', volume: 0.05 });
    this.refreshFlagButton();
  }

  private applyMove(result: MoveResult): void {
    if (result.exploded >= 0) {
      this.lose();
      return;
    }
    const { opened } = result;
    if (!opened.length) return;
    const deepest = opened[opened.length - 1].depth;
    // Big floods play faster, so the wave never keeps the player waiting.
    const step = reducedMotion() ? 0 : Math.min(REVEAL_STEP_MS, REVEAL_MAX_MS / (deepest + 1));
    for (const { index, depth } of opened) {
      // Reduced motion: the cells open at once, with no flash.
      this.revealAt[index] = reducedMotion() ? this.clock - REVEAL_MS : this.clock + depth * step;
      const n = this.board.counts[index];
      if (n > 0) {
        const [x, y] = this.centre(index);
        this.numbers[index] = this.add.image(x, y, this.digitKey(n)).setDepth(2).setVisible(false);
        this.pending.push(index);
      }
    }
    this.animUntil = Math.max(this.animUntil, this.clock + deepest * step + REVEAL_MS);
    this.dirty = true;

    tone({ freq: 620, toFreq: 930, duration: 0.05, type: 'triangle', volume: 0.05 });
    if (opened.length > 8) tone({ freq: 260, toFreq: Math.min(1800, 500 + opened.length * 8), duration: 0.28, type: 'sine', volume: 0.05 });
    this.updateHud();
    if (this.board.status === 'won') this.win();
  }

  // ---------------------------------------------------------------- loop

  update(_time: number, deltaMs: number): void {
    if (this.pause.isPaused) return;
    const dt = frameMs(deltaMs);
    this.clock += dt;
    if (this.started && !this.finished) {
      this.elapsedMs += dt;
      if (Math.floor(this.elapsedMs / 1000) !== this.shownSecond) this.updateHud();
    }
    if (!this.finished) this.handleKeys(dt);
    this.showPendingNumbers();
    const animating = this.clock < this.animUntil + 20 || (this.winAt >= 0 && this.clock < this.winUntil + 20);
    if (this.dirty || animating) {
      this.dirty = false;
      this.render();
    }
  }

  private handleKeys(dt: number): void {
    const c = this.controls;
    for (const dir of Object.keys(DIRS) as Dir[]) {
      if (c.justPressed(dir)) {
        this.heldDir = dir;
        this.repeatIn = CURSOR_REPEAT_DELAY_MS;
        this.stepCursor(dir);
      }
    }
    if (this.heldDir) {
      if (!c.isDown(this.heldDir)) this.heldDir = null;
      else {
        this.repeatIn -= dt;
        if (this.repeatIn <= 0) {
          this.repeatIn += CURSOR_REPEAT_MS;
          this.stepCursor(this.heldDir);
        }
      }
    }
    if (c.justPressed('flagMode')) this.toggleFlagMode();
    const open = c.justPressed('action');
    const flag = c.justPressed('alt') || c.justPressed('flag');
    if (!open && !flag) return;
    // The first press from a hidden cursor only shows where it is.
    if (!this.cursorShown) {
      this.setCursorShown(true);
      return;
    }
    if (flag || (this.flagMode && !this.board.revealed[this.cursor])) this.flagAt(this.cursor);
    else this.primaryAt(this.cursor);
  }

  private stepCursor(dir: Dir): void {
    if (!this.cursorShown) {
      this.setCursorShown(true);
      return;
    }
    const [dc, dr] = DIRS[dir];
    const next = moveCursor(this.board, this.cursor, dc, dr);
    if (next === this.cursor) return;
    this.cursor = next;
    tone({ freq: 1400, duration: 0.02, type: 'sine', volume: 0.02 });
    this.drawCursor();
  }

  private setCursorShown(shown: boolean): void {
    this.cursorShown = shown;
    this.drawCursor();
  }

  /**
   * The texture for the number `n` at this board's cell size, drawn once with its glow and shared
   * by every cell that shows it. A Text per cell would cost a canvas, a measure and an upload each,
   * all in the frame of a big flood.
   */
  private digitKey(n: number): string {
    const size = Math.max(14, Math.round(this.cell * 0.46));
    const key = `mines-digit-${size}-${n}`;
    if (this.textures.exists(key)) return key;
    const color = hex(NUMBER_COLORS[n]);
    const text = this.make.text({ text: String(n), style: { fontFamily: PIXEL_FONT, fontSize: `${size}px`, color } }, false).setShadow(0, 0, color, 8, false, true);
    const tex = this.textures.createCanvas(key, text.canvas.width, text.canvas.height);
    tex?.context.drawImage(text.canvas, 0, 0);
    tex?.refresh();
    text.destroy();
    return key;
  }

  private showPendingNumbers(): void {
    while (this.pendingHead < this.pending.length) {
      const index = this.pending[this.pendingHead];
      if (this.revealAt[index] > this.clock) break;
      this.pendingHead++;
      const t = this.numbers[index];
      if (!t) continue;
      t.setVisible(true);
      if (!reducedMotion()) {
        t.setScale(1.7);
        this.tweens.add({ targets: t, scale: 1, duration: 180, ease: 'Back.easeOut' });
      }
    }
  }

  // ---------------------------------------------------------------- endings

  private lose(): void {
    this.finished = true;
    this.cancelPress();
    this.hover = -1;
    this.setCursorShown(false);
    const { board } = this;
    const first = board.exploded;
    this.detonated[first] = true;
    const [x, y] = this.centre(first);
    this.burst.setParticleTint(NEON.pink);
    this.burst.explode(48, x, y);
    this.burst.setParticleTint(NEON.yellow);
    this.burst.explode(20, x, y);
    impact(this, this.controls, 320, 0.012);
    noise(0.5, 0.14);
    tone({ freq: 320, toFreq: 40, duration: 0.7, type: 'sawtooth', volume: 0.08 });
    this.shownWrong = wrongFlags(board);
    this.dirty = true;

    // The other mines go off one after another, nearest first. Correct flags stay standing.
    const rest = minesByDistance(board, first).filter((i) => i !== first && !board.flagged[i]);
    const step = reducedMotion() ? 0 : Math.min(MINE_CHAIN_MS, MINE_CHAIN_MAX_MS / Math.max(1, rest.length));
    rest.forEach((i, k) => {
      const go = () => {
        this.detonated[i] = true;
        this.dirty = true;
        if (reducedMotion()) return;
        const [mx, my] = this.centre(i);
        this.burst.setParticleTint(k % 2 ? NEON.orange : NEON.pink);
        this.burst.explode(8, mx, my);
        if (k % 3 === 0) noise(0.08, 0.04);
      };
      if (step === 0) go();
      else this.time.delayedCall(260 + k * step, go);
    });
    const chainMs = step === 0 ? 0 : 260 + rest.length * step;
    const pct = Math.floor((clearedCells(board) / (board.cols * board.rows - board.mineCount)) * 100);
    endRun(
      this,
      { gameId: GAME_ID, score: lossScore(this.diff, clearedCells(board)), detail: `${this.diff.label}   HIT A MINE   ${pct}% CLEARED`, ...dailyOutcome(this.daily) },
      chainMs + LOSS_END_DELAY_MS,
    );
  }

  private win(): void {
    this.finished = true;
    this.cancelPress();
    this.hover = -1;
    this.setCursorShown(false);
    const seconds = Math.floor(this.elapsedMs / 1000);
    const id = this.diff.id;
    // Daily boards have their own results; the best times are for the boards picked on the menu.
    const isBest = !this.daily && saveClearTime(id, seconds);
    unlock('mines.clear');
    if (id === 'hard') unlock('mines.hard');
    if (id === 'easy' && seconds <= SPEED_TROPHY_SECONDS) unlock('mines.speed');
    if (id !== 'easy' && !this.placedFlag) unlock('mines.noflags');
    this.updateHud();

    // A green sweep runs out from the middle of the board once the last reveal has played.
    const sweepStart = Math.max(this.clock, this.animUntil);
    const reach = Math.hypot(this.diff.cols / 2, this.diff.rows / 2);
    this.winAt = reducedMotion() ? -1 : sweepStart;
    this.winUntil = sweepStart + reach * 35 + 400;
    const waitMs = sweepStart - this.clock;
    this.time.delayedCall(waitMs, () => {
      showBanner(this, isBest ? 'NEW BEST TIME!' : 'CLEARED!', NEON.green, HEIGHT / 2);
      [523, 659, 784, 1047].forEach((f, i) => this.time.delayedCall(i * 90, () => tone({ freq: f, duration: 0.16, type: 'triangle', volume: 0.08 })));
      if (reducedMotion()) return;
      for (let i = 0; i < 6; i++) {
        this.time.delayedCall(i * 120, () => {
          this.burst.setParticleTint(i % 2 ? NEON.cyan : NEON.green);
          this.burst.explode(16, Phaser.Math.Between(this.ox, this.ox + this.diff.cols * this.cell), Phaser.Math.Between(this.oy, this.oy + this.diff.rows * this.cell));
        });
      }
    });
    const detail = isBest ? `NEW BEST TIME ${formatTime(seconds)} ON ${this.diff.label}` : `${this.diff.label} CLEARED IN ${formatTime(seconds)}`;
    endRun(this, { gameId: GAME_ID, score: winScore(this.diff, seconds), detail, ...dailyOutcome(this.daily) }, waitMs + WIN_END_DELAY_MS);
  }

  // ---------------------------------------------------------------- render

  private updateHud(): void {
    this.shownSecond = Math.floor(this.elapsedMs / 1000);
    this.timeText.setText(`TIME ${formatTime(this.shownSecond)}`);
    const left = minesLeft(this.board);
    this.minesText.setText(`MINES ${left}`).setColor(left < 0 ? hex(NEON.pink) : '#e8e8ff');
  }

  private refreshFlagButton(): void {
    this.flagButton.setFillStyle(NEON.pink, this.flagMode ? 0.4 : 0.08);
    this.flagLabel.setText(this.flagMode ? 'FLAG MODE ON' : 'FLAG MODE');
  }

  private centre(index: number): [number, number] {
    const c = index % this.diff.cols;
    const r = Math.floor(index / this.diff.cols);
    return [this.ox + c * this.cell + this.cell / 2, this.oy + r * this.cell + this.cell / 2];
  }

  private drawCursor(): void {
    const g = this.cursorGfx.clear();
    const s = this.cell;
    const outline = (index: number, color: number, width: number, alpha: number) => {
      const x = this.ox + (index % this.diff.cols) * s;
      const y = this.oy + Math.floor(index / this.diff.cols) * s;
      g.lineStyle(width, color, alpha).strokeRoundedRect(x + 1, y + 1, s - 2, s - 2, Math.max(3, s * 0.14));
    };
    if (this.finished) return;
    if (this.cursorShown) {
      outline(this.cursor, NEON.yellow, 6, 0.2);
      outline(this.cursor, NEON.yellow, 2, 1);
    } else if (this.hover >= 0) {
      outline(this.hover, NEON.cyan, 1, 0.6);
    }
  }

  private render(): void {
    const g = this.gfx.clear();
    const { board, cell: s } = this;
    const lost = board.status === 'lost';
    const won = board.status === 'won';
    const radius = Math.max(2, s * 0.12);
    const midC = (this.diff.cols - 1) / 2;
    const midR = (this.diff.rows - 1) / 2;
    for (let i = 0; i < board.mines.length; i++) {
      const c = i % this.diff.cols;
      const r = Math.floor(i / this.diff.cols);
      const x = this.ox + c * s;
      const y = this.oy + r * s;
      const cx = x + s / 2;
      const cy = y + s / 2;

      if (this.detonated[i]) {
        const first = i === board.exploded;
        g.fillStyle(first ? NEON.pink : 0x2a0618, first ? 0.55 : 1).fillRoundedRect(x + 1, y + 1, s - 2, s - 2, radius);
        this.drawMine(g, cx, cy, s, first ? NEON.white : NEON.pink);
        continue;
      }

      if (board.revealed[i] && this.revealAt[i] <= this.clock) {
        g.fillStyle(OPEN_FILL, 1).fillRect(x + 1, y + 1, s - 2, s - 2);
        g.lineStyle(1, NEON.cyan, 0.1).strokeRect(x + 1, y + 1, s - 2, s - 2);
        const t = (this.clock - this.revealAt[i]) / REVEAL_MS;
        if (t < 1) {
          // The flash: a bright tile that grows to fill the cell as it fades.
          const k = 0.45 + 0.55 * t;
          const w = (s - 2) * k;
          g.fillStyle(NEON.cyan, 0.5 * (1 - t)).fillRoundedRect(cx - w / 2, cy - w / 2, w, w, radius);
          g.lineStyle(2, NEON.white, 0.8 * (1 - t)).strokeRoundedRect(cx - w / 2, cy - w / 2, w, w, radius);
        }
        if (this.winAt >= 0) {
          const d = Math.hypot(c - midC, r - midR);
          const wt = (this.clock - this.winAt - d * 35) / 400;
          if (wt >= 0 && wt < 1) g.fillStyle(NEON.green, 0.4 * (1 - wt)).fillRect(x + 1, y + 1, s - 2, s - 2);
        }
        continue;
      }

      const pressed = this.press?.index === i && !this.press.consumed;
      g.fillStyle(pressed ? PRESSED_FILL : HIDDEN_FILL, 1).fillRoundedRect(x + 2, y + 2, s - 4, s - 4, radius);
      g.lineStyle(1, NEON.purple, pressed ? 0.95 : 0.5).strokeRoundedRect(x + 2, y + 2, s - 4, s - 4, radius);
      if (board.flagged[i]) {
        this.drawFlag(g, cx, cy, s, won ? NEON.green : NEON.pink);
        if (lost && this.shownWrong.includes(i)) {
          // A flag on a safe cell, crossed out.
          const k = s * 0.3;
          g.lineStyle(3, NEON.yellow, 1).lineBetween(cx - k, cy - k, cx + k, cy + k).lineBetween(cx - k, cy + k, cx + k, cy - k);
        }
      }
    }
  }

  private drawFlag(g: Phaser.GameObjects.Graphics, cx: number, cy: number, s: number, color: number): void {
    const px = cx - s * 0.12;
    g.fillStyle(color, 0.16).fillCircle(cx, cy, s * 0.34);
    g.lineStyle(2, color, 1).lineBetween(px, cy - s * 0.27, px, cy + s * 0.27);
    g.fillStyle(color, 1).fillTriangle(px, cy - s * 0.27, px, cy + s * 0.03, px + s * 0.36, cy - s * 0.12);
    g.lineStyle(2, color, 0.8).lineBetween(px - s * 0.12, cy + s * 0.27, px + s * 0.12, cy + s * 0.27);
  }

  private drawMine(g: Phaser.GameObjects.Graphics, cx: number, cy: number, s: number, color: number): void {
    g.fillStyle(color, 0.22).fillCircle(cx, cy, s * 0.38);
    g.lineStyle(2, color, 1);
    for (let a = 0; a < 4; a++) {
      const ang = (a * Math.PI) / 4;
      const dx = Math.cos(ang) * s * 0.3;
      const dy = Math.sin(ang) * s * 0.3;
      g.lineBetween(cx - dx, cy - dy, cx + dx, cy + dy);
    }
    g.fillStyle(color, 1).fillCircle(cx, cy, s * 0.18);
    g.fillStyle(NEON.white, 0.9).fillCircle(cx - s * 0.06, cy - s * 0.06, Math.max(1.5, s * 0.05));
  }
}
