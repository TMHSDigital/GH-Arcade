import Phaser from 'phaser';
import { drawGem } from '../art';
import { loadBests, type Mode, recordModeScore } from '../best';
import {
  BOARD_X,
  BOARD_Y,
  CELL,
  CLEAR_MS,
  CURSOR_DELAY_MS,
  CURSOR_REPEAT_MS,
  DRAG_SWAP,
  FALL_MS_BASE,
  FALL_MS_PER_ROW,
  GAME_ID,
  GEM_TINTS,
  HEIGHT,
  HINT_MS,
  MAX_SECONDS,
  MOVES,
  PANEL_X,
  SHAKE_CHAIN,
  SHUFFLE_MS,
  SWAP_MS,
  TIME_PER_MATCH,
  TIMED_SECONDS,
  WIDTH,
} from '../config';
import {
  areAdjacent,
  type Board,
  fillBoard,
  findMove,
  type Gem,
  inBounds,
  isValidSwap,
  type Pos,
  reshuffle,
  step,
  type StepResult,
  swapGems,
} from '../rules';
import { trophiesFor } from '../../../shared/achievements';
import { ArcadeControls } from '../../../shared/controls';
import { frameMs } from '../../../shared/frame';
import { PauseController } from '../../../shared/pause';
import { createRng, dailyOutcome, type DailyRun, dailyRunFrom, getDailyBest, type Rng } from '../../../shared/rng';
import { endRun, SCENE } from '../../../shared/scenes';
import { noise, tone } from '../../../shared/sfx';
import { burstEmitter, dailyHudLabel, drawGrid, floatText, hex, HUD_LABEL_STYLE, HUD_STYLE, impact, NEON, neonText, reducedMotion, showBanner } from '../../../shared/ui';
import type { TROPHIES } from '../trophies';

const { addCounter, reach, unlock } = trophiesFor<typeof TROPHIES>();

const SIZE = 8;
const BOARD_PX = SIZE * CELL;
const DIRS: Record<'left' | 'right' | 'up' | 'down', Pos> = {
  left: { r: 0, c: -1 },
  right: { r: 0, c: 1 },
  up: { r: -1, c: 0 },
  down: { r: 1, c: 0 },
};
type Dir = keyof typeof DIRS;

const cellX = (c: number) => BOARD_X + c * CELL + CELL / 2;
const cellY = (r: number) => BOARD_Y + r * CELL + CELL / 2;
const samePos = (a: Pos | null, b: Pos | null) => !!a && !!b && a.r === b.r && a.c === b.c;
const plus = (p: Pos, d: Pos): Pos => ({ r: p.r + d.r, c: p.c + d.c });

export class GameScene extends Phaser.Scene {
  private mode: Mode = 'timed';
  /** The daily challenge being played, or null in a normal game. */
  private daily: DailyRun | null = null;
  private rng!: Rng;
  private board!: Board;
  /** 'idle' takes input; 'busy' while gems swap, clear or fall; 'over' once the run has ended. */
  private phase: 'idle' | 'busy' | 'over' = 'idle';

  private score = 0;
  private timeLeft = TIMED_SECONDS;
  private movesLeft = MOVES;
  private bestChain = 0;
  private modeBest = 0;
  private shownSeconds = -1;

  private sprites = new Map<number, Phaser.GameObjects.Graphics>();
  private selected: Pos | null = null;
  private cursor: Pos = { r: 3, c: 3 };
  private cursorShown = false;
  private heldDir: Dir | null = null;
  private heldMs = 0;
  private drag: { cell: Pos; x: number; y: number } | null = null;
  private idleMs = 0;
  private hinted: Phaser.GameObjects.Graphics[] = [];

  private overlay!: Phaser.GameObjects.Graphics;
  private burst!: Phaser.GameObjects.Particles.ParticleEmitter;
  private scoreText!: Phaser.GameObjects.Text;
  private bestText!: Phaser.GameObjects.Text;
  private leftText!: Phaser.GameObjects.Text;
  private chainText!: Phaser.GameObjects.Text;
  private timeBar!: Phaser.GameObjects.Graphics;
  private controls!: ArcadeControls;
  private pause!: PauseController;

  constructor() {
    super(SCENE.game);
  }

  init(data: { mode?: Mode; daily?: boolean } = {}): void {
    // Scenes are reused between runs, so every field is reset here.
    // Daily challenge: always Moves, so the result depends on choices rather than speed. The first
    // fill, every refill and any reshuffle come from one sequence seeded by the date, so the same
    // swaps give everyone the same boards.
    this.daily = dailyRunFrom(data, GAME_ID);
    this.mode = this.daily || data.mode === 'moves' ? 'moves' : 'timed';
    this.rng = this.daily ? this.daily.rng('board') : createRng(Date.now());
    this.board = fillBoard(this.rng.next, SIZE);
    // Busy until the opening deal has landed (see create), so no swap races the deal's tweens.
    this.phase = 'busy';
    this.score = 0;
    this.timeLeft = TIMED_SECONDS;
    this.movesLeft = MOVES;
    this.bestChain = 0;
    // A daily keeps its own best for the day (none for a replay of an earlier day), not the mode's.
    this.modeBest = this.daily ? (this.daily.past ? 0 : getDailyBest(GAME_ID, this.daily.day)) : loadBests()[this.mode];
    this.shownSeconds = -1;
    this.sprites = new Map();
    this.selected = null;
    this.cursor = { r: 3, c: 3 };
    this.cursorShown = false;
    this.heldDir = null;
    this.heldMs = 0;
    this.drag = null;
    this.idleMs = 0;
    this.hinted = [];
  }

  create(): void {
    this.cameras.main.fadeIn(250, 5, 5, 13);
    drawGrid(this, WIDTH, HEIGHT, 64);
    this.drawStatic();
    this.burst = burstEmitter(this, 280, 600);
    this.overlay = this.add.graphics().setDepth(15);
    if (!reducedMotion()) this.tweens.add({ targets: this.overlay, alpha: 0.55, duration: 500, yoyo: true, repeat: -1 });
    this.buildHud();

    this.controls = new ArcadeControls(this);
    this.pause = new PauseController(this, this.controls, { canPause: () => this.phase !== 'over' });
    this.bindPointer();

    // Deal the board in: each column drops in from above, a little after the one before.
    this.board.grid.forEach((row, r) =>
      row.forEach((gem, c) => {
        if (!gem) return;
        const s = this.makeSprite(gem, c, r - SIZE);
        this.tweens.add({ targets: s, y: cellY(r), duration: 380 + (SIZE - r) * 25, delay: c * 35, ease: 'Cubic.easeOut' });
      }),
    );
    // The last gem to land is the top one of the last column.
    this.time.delayedCall(380 + SIZE * 25 + (SIZE - 1) * 35 + 30, () => this.settle());
    this.updateHud();
  }

  // ---------------------------------------------------------------- setup

  private drawStatic(): void {
    const g = this.add.graphics().setDepth(-5);
    g.fillStyle(0x0a0a1c, 0.92).fillRect(BOARD_X, BOARD_Y, BOARD_PX, BOARD_PX);
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) if ((r + c) % 2 === 0) g.fillStyle(NEON.purple, 0.05).fillRect(BOARD_X + c * CELL, BOARD_Y + r * CELL, CELL, CELL);
    }
    g.lineStyle(6, NEON.pink, 0.12).strokeRect(BOARD_X - 4, BOARD_Y - 4, BOARD_PX + 8, BOARD_PX + 8);
    g.lineStyle(2, NEON.pink, 0.8).strokeRect(BOARD_X - 2, BOARD_Y - 2, BOARD_PX + 4, BOARD_PX + 4);
    // Gems wait above the board before they drop in; this strip hides them until they cross the edge.
    this.add
      .rectangle(BOARD_X - 8, 0, BOARD_PX + 16, BOARD_Y - 6, NEON.bg)
      .setOrigin(0)
      .setDepth(12);
    this.add.graphics().setDepth(13).lineStyle(2, NEON.pink, 0.8).lineBetween(BOARD_X - 2, BOARD_Y - 2, BOARD_X + BOARD_PX + 2, BOARD_Y - 2);
  }

  private buildHud(): void {
    neonText(this, PANEL_X, 70, this.mode === 'timed' ? 'TIMED' : 'MOVES', 18, this.mode === 'timed' ? NEON.cyan : NEON.yellow);
    const x = PANEL_X - 80;
    this.add.text(x, 120, 'SCORE', HUD_LABEL_STYLE);
    this.scoreText = this.add.text(x, 138, '0', HUD_STYLE);
    this.add.text(x, 190, 'BEST', HUD_LABEL_STYLE);
    this.bestText = this.add.text(x, 208, '', HUD_STYLE);
    this.add.text(x, 260, this.mode === 'timed' ? 'TIME' : 'MOVES LEFT', HUD_LABEL_STYLE);
    this.leftText = this.add.text(x, 278, '', { ...HUD_STYLE, fontSize: '24px' });
    this.timeBar = this.add.graphics();
    this.add.text(x, 350, 'BEST CHAIN', HUD_LABEL_STYLE);
    this.chainText = this.add.text(x, 368, '-', HUD_STYLE);
    if (this.daily) dailyHudLabel(this, x, 420, GAME_ID, this.daily, { narrow: true });
  }

  private makeSprite(gem: Gem, c: number, r: number): Phaser.GameObjects.Graphics {
    const g = this.add.graphics({ x: cellX(c), y: cellY(r) }).setDepth(5);
    drawGem(g, gem.color, gem.special, CELL);
    this.sprites.set(gem.id, g);
    return g;
  }

  // ---------------------------------------------------------------- input

  private cellAt(x: number, y: number): Pos | null {
    const p = { r: Math.floor((y - BOARD_Y) / CELL), c: Math.floor((x - BOARD_X) / CELL) };
    return inBounds(this.board, p) ? p : null;
  }

  private bindPointer(): void {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      // A tap on the pause menu (including the one that resumes) is not a game gesture.
      if (this.pause.isPaused || this.phase === 'over') {
        this.drag = null;
        return;
      }
      const cell = this.cellAt(p.x, p.y);
      this.cursorShown = false;
      if (!cell) {
        this.select(null);
        return;
      }
      this.drag = { cell, x: p.x, y: p.y };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const d = this.drag;
      if (!d || !p.isDown || this.pause.isPaused) return;
      const dx = p.x - d.x;
      const dy = p.y - d.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < DRAG_SWAP) return;
      this.drag = null;
      const dir: Dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      this.select(null);
      this.trySwap(d.cell, plus(d.cell, DIRS[dir]));
    });
    // Releases outside the canvas count too, so a finger that slides off the edge is not left dragging.
    const release = () => {
      const d = this.drag;
      this.drag = null;
      if (!d || this.pause.isPaused) return;
      this.tapCell(d.cell);
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);
  }

  /** Tap-tap swapping: the first tap picks a gem, a tap on a neighbour swaps, anywhere else picks again. */
  private tapCell(cell: Pos): void {
    if (this.phase !== 'idle') return;
    if (samePos(this.selected, cell)) this.select(null);
    else if (this.selected && areAdjacent(this.selected, cell)) this.trySwap(this.selected, cell);
    else this.select(cell);
  }

  private select(cell: Pos | null): void {
    if (cell && !samePos(cell, this.selected)) tone({ freq: 520, duration: 0.04, type: 'triangle', volume: 0.05 });
    this.selected = cell;
    // The keyboard cursor carries on from whatever was picked last, by any input.
    if (cell) this.cursor = cell;
    this.drawOverlay();
  }

  /** Keyboard and gamepad: move the cursor, pick a gem with Action, then push a direction to swap. */
  private handleKeys(delta: number): void {
    const c = this.controls;
    const pressed = (Object.keys(DIRS) as Dir[]).find((d) => c.justPressed(d));
    const held = (Object.keys(DIRS) as Dir[]).find((d) => c.isDown(d));
    let move: Dir | null = null;
    if (pressed) {
      move = pressed;
      this.heldDir = pressed;
      this.heldMs = 0;
    } else if (held && held === this.heldDir && !this.selected) {
      this.heldMs += delta;
      if (this.heldMs >= CURSOR_DELAY_MS) {
        this.heldMs -= CURSOR_REPEAT_MS;
        move = held;
      }
    } else if (!held) {
      this.heldDir = null;
    }

    if (c.justPressed('alt')) this.select(null);
    if (c.justPressed('action')) {
      this.cursorShown = true;
      if (this.selected) this.select(null);
      else this.select(this.cursor);
      return;
    }
    if (!move) return;
    if (!this.cursorShown) {
      // The first press only shows where the cursor is.
      this.cursorShown = true;
      if (this.selected) this.cursor = this.selected;
      this.drawOverlay();
      return;
    }
    if (this.selected) {
      const from = this.selected;
      const to = plus(from, DIRS[move]);
      this.select(null);
      if (inBounds(this.board, to)) {
        this.cursor = to;
        this.trySwap(from, to);
      }
      return;
    }
    const next = plus(this.cursor, DIRS[move]);
    if (inBounds(this.board, next)) {
      this.cursor = next;
      tone({ freq: 300, duration: 0.02, type: 'square', volume: 0.02 });
      this.drawOverlay();
    }
  }

  private drawOverlay(): void {
    const g = this.overlay.clear();
    const box = (p: Pos, color: number, width: number) =>
      g.lineStyle(width, color, 1).strokeRoundedRect(BOARD_X + p.c * CELL + 3, BOARD_Y + p.r * CELL + 3, CELL - 6, CELL - 6, 10);
    if (this.cursorShown && this.phase !== 'over') box(this.cursor, NEON.white, 2);
    if (this.selected) {
      box(this.selected, NEON.yellow, 4);
      g.fillStyle(NEON.yellow, 0.12).fillRoundedRect(BOARD_X + this.selected.c * CELL + 3, BOARD_Y + this.selected.r * CELL + 3, CELL - 6, CELL - 6, 10);
    }
  }

  // ---------------------------------------------------------------- loop

  update(_time: number, rawDelta: number): void {
    if (this.pause.isPaused) return;
    const delta = frameMs(rawDelta);
    if (this.phase === 'over') return;

    if (this.mode === 'timed') {
      this.timeLeft = Math.max(0, this.timeLeft - delta / 1000);
      this.updateClock();
    }
    if (this.outOfTurns()) {
      if (this.phase === 'idle') this.finish();
      return;
    }
    if (this.phase !== 'idle') return;

    this.handleKeys(delta);
    this.idleMs += delta;
    if (this.idleMs >= HINT_MS && this.hinted.length === 0) this.showHint();
  }

  private outOfTurns(): boolean {
    return this.mode === 'timed' ? this.timeLeft <= 0 : this.movesLeft <= 0;
  }

  // ---------------------------------------------------------------- swapping and cascades

  private trySwap(a: Pos, b: Pos): void {
    if (this.phase !== 'idle' || this.outOfTurns() || !inBounds(this.board, a) || !inBounds(this.board, b) || !areAdjacent(a, b)) return;
    this.clearHint();
    this.idleMs = 0;
    const ga = this.board.grid[a.r][a.c];
    const gb = this.board.grid[b.r][b.c];
    if (!ga || !gb) return;
    const sa = this.sprites.get(ga.id)!;
    const sb = this.sprites.get(gb.id)!;
    this.phase = 'busy';
    this.drawOverlay();

    if (!isValidSwap(this.board, a, b)) {
      // Not a match: the gems trade places and bounce back.
      tone({ freq: 220, toFreq: 160, duration: 0.12, type: 'square', volume: 0.05 });
      this.tweens.add({ targets: sa, x: cellX(b.c), y: cellY(b.r), duration: SWAP_MS, yoyo: true, ease: 'Sine.easeInOut' });
      this.tweens.add({
        targets: sb,
        x: cellX(a.c),
        y: cellY(a.r),
        duration: SWAP_MS,
        yoyo: true,
        ease: 'Sine.easeInOut',
        onComplete: () => this.settle(),
      });
      return;
    }

    swapGems(this.board, a, b);
    if (this.mode === 'moves') this.movesLeft--;
    this.updateHud();
    tone({ freq: 440, toFreq: 560, duration: 0.07, type: 'triangle', volume: 0.05 });
    this.tweens.add({ targets: sa, x: cellX(b.c), y: cellY(b.r), duration: SWAP_MS, ease: 'Sine.easeInOut' });
    this.tweens.add({
      targets: sb,
      x: cellX(a.c),
      y: cellY(a.r),
      duration: SWAP_MS,
      ease: 'Sine.easeInOut',
      onComplete: () => this.cascade(1, [a, b]),
    });
  }

  /** Clears whatever matches, lets the board fall, and goes again until nothing matches. */
  private cascade(chain: number, moved: Pos[] = []): void {
    const result = step(this.board, this.rng.next, chain, moved);
    if (!result) {
      this.afterCascade();
      return;
    }
    this.showClear(result);
    this.time.delayedCall(CLEAR_MS, () => {
      let longest = 0;
      for (const f of result.falls) {
        const sprite = this.sprites.get(f.gem.id) ?? this.makeSprite(f.gem, f.col, f.fromRow);
        const ms = FALL_MS_BASE + (f.toRow - f.fromRow) * FALL_MS_PER_ROW;
        longest = Math.max(longest, ms);
        this.tweens.add({ targets: sprite, y: cellY(f.toRow), duration: ms, ease: 'Quad.easeIn' });
      }
      this.time.delayedCall(longest + 30, () => {
        tone({ freq: 160, duration: 0.03, type: 'square', volume: 0.025 });
        this.cascade(chain + 1);
      });
    });
  }

  private showClear(s: StepResult): void {
    // Score first, so the popups show the new total straight away.
    this.score += s.points;
    if (s.chain > this.bestChain) this.bestChain = s.chain;
    reach('match.chain', s.chain);
    reach('match.score', this.score);
    addCounter('match.gems', s.cleared.length);
    if (this.mode === 'timed') this.timeLeft = Math.min(MAX_SECONDS, this.timeLeft + s.groups.length * TIME_PER_MATCH);
    this.updateHud();

    for (const { pos, gem } of s.cleared) {
      const sprite = this.sprites.get(gem.id);
      this.sprites.delete(gem.id);
      this.burst.setParticleTint(GEM_TINTS[gem.color]);
      this.burst.explode(5, cellX(pos.c), cellY(pos.r));
      if (!sprite) continue;
      this.tweens.add({ targets: sprite, scale: 1.35, alpha: 0, duration: CLEAR_MS, ease: 'Quad.easeOut', onComplete: () => sprite.destroy() });
    }
    for (const { pos, gem } of s.blasts) this.showBlast(pos, gem.special);
    for (const { pos, gem } of s.created) {
      const sprite = this.makeSprite(gem, pos.c, pos.r).setScale(0.2).setAlpha(0);
      this.tweens.add({ targets: sprite, scale: 1, alpha: 1, duration: CLEAR_MS + 60, ease: 'Back.easeOut' });
      tone({ freq: 880, toFreq: 1320, duration: 0.15, type: 'triangle', volume: 0.07 });
    }

    // Score popup over the middle of the first match.
    const cells = s.groups[0].cells;
    const cx = cells.reduce((sum, p) => sum + cellX(p.c), 0) / cells.length;
    const cy = cells.reduce((sum, p) => sum + cellY(p.r), 0) / cells.length;
    floatText(this, cx, cy, `+${s.points}`, s.chain > 1 ? NEON.yellow : NEON.white, s.chain > 1 ? 16 : 12);
    if (s.chain >= 2) showBanner(this, `CHAIN x${s.chain}`, s.chain >= SHAKE_CHAIN ? NEON.yellow : NEON.cyan, BOARD_Y + BOARD_PX / 2);

    // Each link of a chain rings a step higher.
    const base = 392 * Math.pow(2, Math.min(s.chain - 1, 8) / 6);
    tone({ freq: base, toFreq: base * 1.5, duration: 0.12, type: 'triangle', volume: 0.07 });
    if (s.chain >= SHAKE_CHAIN || s.blasts.some((b) => b.gem.special === 'bomb')) {
      impact(this, this.controls, 120 + s.chain * 30, Math.min(0.012, 0.003 + s.chain * 0.0012));
    }
  }

  private showBlast(pos: Pos, special: Gem['special']): void {
    const x = cellX(pos.c);
    const y = cellY(pos.r);
    let flash: Phaser.GameObjects.Shape;
    if (special === 'bomb') {
      unlock('match.bomb');
      noise(0.25, 0.08);
      flash = this.add.circle(x, y, CELL * 1.5, NEON.white, 0.6);
    } else if (special === 'lineH') {
      flash = this.add.rectangle(BOARD_X + BOARD_PX / 2, y, BOARD_PX, CELL * 0.5, NEON.white, 0.6);
    } else {
      flash = this.add.rectangle(x, BOARD_Y + BOARD_PX / 2, CELL * 0.5, BOARD_PX, NEON.white, 0.6);
    }
    tone({ freq: 1200, toFreq: 300, duration: 0.2, type: 'sawtooth', volume: 0.05 });
    flash.setDepth(20).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: flash, alpha: 0, scale: special === 'bomb' ? 1.3 : 1, duration: 260, onComplete: () => flash.destroy() });
  }

  /** The cascade is over: end the run if that was the last turn, reshuffle a dead board, or wait for the next move. */
  private afterCascade(): void {
    if (this.outOfTurns()) {
      this.finish();
      return;
    }
    if (!findMove(this.board)) {
      this.shuffle();
      return;
    }
    this.settle();
  }

  private settle(): void {
    if (this.phase === 'over') return;
    this.phase = 'idle';
    this.idleMs = 0;
    this.drawOverlay();
  }

  private shuffle(): void {
    showBanner(this, 'NO MOVES\nSHUFFLE', NEON.purple, BOARD_Y + BOARD_PX / 2);
    tone({ freq: 300, toFreq: 600, duration: 0.3, type: 'triangle', volume: 0.06 });
    this.time.delayedCall(500, () => {
      reshuffle(this.board, this.rng.next);
      const keep = new Set<number>();
      this.board.grid.forEach((row, r) =>
        row.forEach((gem, c) => {
          if (!gem) return;
          keep.add(gem.id);
          const sprite = this.sprites.get(gem.id) ?? this.makeSprite(gem, c, r - SIZE);
          this.tweens.add({ targets: sprite, x: cellX(c), y: cellY(r), duration: SHUFFLE_MS, ease: 'Cubic.easeInOut' });
        }),
      );
      // A fresh deal replaces every gem, so the old ones fade away.
      for (const [id, sprite] of this.sprites) {
        if (keep.has(id)) continue;
        this.sprites.delete(id);
        this.tweens.add({ targets: sprite, alpha: 0, duration: SHUFFLE_MS, onComplete: () => sprite.destroy() });
      }
      this.time.delayedCall(SHUFFLE_MS + 30, () => this.settle());
    });
  }

  // ---------------------------------------------------------------- hint

  private showHint(): void {
    const move = findMove(this.board);
    this.idleMs = 0;
    if (!move) return;
    for (const p of move) {
      const gem = this.board.grid[p.r][p.c];
      const sprite = gem && this.sprites.get(gem.id);
      if (sprite) this.hinted.push(sprite);
    }
    // The hint is help, not decoration, so reduced motion still gets it: held larger instead of pulsing.
    if (reducedMotion()) this.hinted.forEach((s) => s.setScale(1.15));
    else this.tweens.add({ targets: this.hinted, scale: 1.18, duration: 320, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  private clearHint(): void {
    for (const s of this.hinted) {
      this.tweens.killTweensOf(s);
      s.setScale(1);
    }
    this.hinted = [];
  }

  // ---------------------------------------------------------------- HUD and end

  private updateHud(): void {
    this.scoreText.setText(this.score.toLocaleString());
    this.bestText.setText(Math.max(this.modeBest, this.score).toLocaleString());
    this.chainText.setText(this.bestChain > 1 ? `x${this.bestChain}` : '-');
    if (this.mode === 'moves') {
      this.leftText.setText(String(this.movesLeft)).setColor(this.movesLeft <= 5 ? hex(NEON.pink) : HUD_STYLE.color);
    } else {
      this.shownSeconds = -1;
      this.updateClock();
    }
  }

  /** Redraws the clock only when the whole second shown changes. */
  private updateClock(): void {
    const secs = Math.ceil(this.timeLeft);
    if (secs === this.shownSeconds) return;
    const ticking = secs <= 10 && secs < this.shownSeconds;
    this.shownSeconds = secs;
    const low = secs <= 10;
    this.leftText.setText(String(secs)).setColor(low ? hex(NEON.pink) : HUD_STYLE.color);
    if (ticking && secs > 0) tone({ freq: 880, duration: 0.04, type: 'square', volume: 0.04 });
    const w = 160;
    const x = PANEL_X - 80;
    this.timeBar
      .clear()
      .fillStyle(NEON.muted, 0.25)
      .fillRect(x, 314, w, 8)
      .fillStyle(low ? NEON.pink : NEON.cyan, 0.9)
      .fillRect(x, 314, (w * Math.min(secs, TIMED_SECONDS)) / TIMED_SECONDS, 8);
  }

  private finish(): void {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this.clearHint();
    this.select(null);
    reach('match.score', this.score);
    // A daily run is recorded as the day's result by the game-over screen, not as a Moves best.
    const newBest = !this.daily && recordModeScore(this.mode, this.score);
    showBanner(this, this.mode === 'timed' ? 'TIME UP' : 'OUT OF MOVES', NEON.pink, BOARD_Y + BOARD_PX / 2);
    tone({ freq: 660, toFreq: 220, duration: 0.6, type: 'triangle', volume: 0.08 });
    for (const sprite of this.sprites.values()) this.tweens.add({ targets: sprite, alpha: 0.25, duration: 600 });
    const label = this.mode === 'timed' ? 'TIMED' : 'MOVES';
    const chain = this.bestChain > 1 ? `   BEST CHAIN x${this.bestChain}` : '';
    endRun(this, { gameId: GAME_ID, score: this.score, detail: `${newBest ? `NEW ${label} BEST` : label}${chain}`, ...dailyOutcome(this.daily) }, 1300);
  }
}
