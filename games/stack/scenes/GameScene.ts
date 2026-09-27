import Phaser from 'phaser';
import {
  ARR_MS,
  BOARD_X,
  BOARD_Y,
  CELL,
  DAS_MS,
  DRAG_STEP,
  GAME_ID,
  HEIGHT,
  LINES_PER_LEVEL,
  LOCK_DELAY_MS,
  MAX_LOCK_RESETS,
  NEXT_PREVIEW,
  PIECE_COLORS,
  SOFT_DROP_SECONDS,
} from '../config';
import {
  Bag,
  type Board,
  cellsOf,
  clearRows,
  COLS,
  collides,
  dropDistance,
  emptyBoard,
  fullRows,
  gravitySeconds,
  HIDDEN_ROWS,
  LINE_POINTS,
  lock,
  type Piece,
  type PieceType,
  ROTATIONS,
  ROWS,
  spawn,
  tryMove,
  tryRotate,
  VISIBLE_ROWS,
} from '../logic';
import { ArcadeControls } from '../../../shared/controls';
import { PauseController } from '../../../shared/pause';
import { noise, tone } from '../../../shared/sfx';
import { isTouchDevice, VirtualButton } from '../../../shared/touch';
import { burstEmitter, NEON, neonText, PIXEL_FONT, showBanner } from '../../../shared/ui';

type Extra = 'rotCW' | 'rotCCW' | 'hold' | 'drop';

const BOARD_W = COLS * CELL;
const BOARD_H = VISIBLE_ROWS * CELL;
const LEFT_PANEL_X = BOARD_X - 30 - 150;
const RIGHT_PANEL_X = BOARD_X + BOARD_W + 30;
const CLEAR_NAMES = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'QUAD!'];

export class GameScene extends Phaser.Scene {
  private board: Board = emptyBoard();
  private bag = new Bag();
  private piece!: Piece;
  private holdType: PieceType | null = null;
  private canHold = true;
  private state: 'playing' | 'clearing' | 'over' = 'playing';

  private score = 0;
  private lines = 0;
  private level = 1;
  private combo = -1;
  private backToBack = false;

  private gravityAcc = 0;
  private lockTimer = 0;
  private lockResets = 0;
  private lowestY = 0;
  private dasDir = 0;
  private dasTimer = 0;
  private arrTimer = 0;
  private clearingRows: number[] = [];
  /** Rows (counted from the bottom) greyed out by the game-over animation. */
  private greyRows = 0;
  private drag: { lastX: number; lastY: number; startY: number; t: number; moved: boolean } | null = null;

  private gfx!: Phaser.GameObjects.Graphics;
  private burst!: Phaser.GameObjects.Particles.ParticleEmitter;
  private scoreText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private linesText!: Phaser.GameObjects.Text;
  private controls!: ArcadeControls<Extra>;
  private pause!: PauseController;
  private holdButton?: VirtualButton;

  constructor() {
    super('Game');
  }

  init(): void {
    this.board = emptyBoard();
    this.bag = new Bag();
    this.holdType = null;
    this.canHold = true;
    this.state = 'playing';
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.combo = -1;
    this.backToBack = false;
    this.gravityAcc = 0;
    this.dasDir = 0;
    this.clearingRows = [];
    this.greyRows = 0;
    this.drag = null;
    this.holdButton = undefined;
  }

  create(): void {
    this.cameras.main.fadeIn(250, 5, 5, 13);
    this.drawStatic();
    this.gfx = this.add.graphics();
    this.burst = burstEmitter(this, 320, 700);

    const label = { fontFamily: PIXEL_FONT, fontSize: '10px', color: '#8a8ab8' };
    const value = { fontFamily: PIXEL_FONT, fontSize: '16px', color: '#e8e8ff' };
    const statY = BOARD_Y + 200;
    this.add.text(LEFT_PANEL_X, statY, 'SCORE', label);
    this.scoreText = this.add.text(LEFT_PANEL_X, statY + 18, '0', value);
    this.add.text(LEFT_PANEL_X, statY + 60, 'LEVEL', label);
    this.levelText = this.add.text(LEFT_PANEL_X, statY + 78, '1', value);
    this.add.text(LEFT_PANEL_X, statY + 120, 'LINES', label);
    this.linesText = this.add.text(LEFT_PANEL_X, statY + 138, '0', value);

    this.controls = new ArcadeControls<Extra>(this, {
      rotCW: { keys: ['UP', 'X', 'W'], buttons: [0] },
      rotCCW: { keys: ['Z', 'CTRL'], buttons: [1, 2] },
      hold: { keys: ['C', 'SHIFT'], buttons: [3, 4, 5] },
      drop: { keys: ['SPACE'], buttons: [12] },
    });
    this.pause = new PauseController(this, this.controls, { canPause: () => this.state !== 'over' });

    if (isTouchDevice()) {
      this.holdButton = new VirtualButton(this, LEFT_PANEL_X + 75, HEIGHT - 70, 'HOLD', NEON.purple, 40);
      this.controls.addVirtual('hold', () => this.holdButton!.isDown);
    }
    this.bindTouch();

    this.spawnNext();
  }

  private drawStatic(): void {
    const g = this.add.graphics().setDepth(-5);
    g.fillStyle(0x0a0a1c, 1).fillRect(BOARD_X, BOARD_Y, BOARD_W, BOARD_H);
    g.lineStyle(1, NEON.purple, 0.08);
    for (let x = 1; x < COLS; x++) g.lineBetween(BOARD_X + x * CELL, BOARD_Y, BOARD_X + x * CELL, BOARD_Y + BOARD_H);
    for (let y = 1; y < VISIBLE_ROWS; y++) g.lineBetween(BOARD_X, BOARD_Y + y * CELL, BOARD_X + BOARD_W, BOARD_Y + y * CELL);
    g.lineStyle(6, NEON.cyan, 0.12).strokeRect(BOARD_X - 4, BOARD_Y - 4, BOARD_W + 8, BOARD_H + 8);
    g.lineStyle(2, NEON.cyan, 0.8).strokeRect(BOARD_X - 2, BOARD_Y - 2, BOARD_W + 4, BOARD_H + 4);

    const panel = (x: number, y: number, h: number, title: string) => {
      g.lineStyle(2, NEON.purple, 0.5).strokeRoundedRect(x, y, 150, h, 8);
      neonText(this, x + 75, y + 18, title, 12, NEON.purple);
    };
    panel(LEFT_PANEL_X, BOARD_Y, 150, 'HOLD');
    panel(RIGHT_PANEL_X, BOARD_Y, 110 + (NEXT_PREVIEW - 1) * 90, 'NEXT');
  }

  // ---------------------------------------------------------------- touch

  private bindTouch(): void {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.holdButton?.contains(p.x, p.y)) return;
      this.drag = { lastX: p.x, lastY: p.y, startY: p.y, t: this.time.now, moved: false };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const d = this.drag;
      if (!d || !p.isDown || this.state !== 'playing' || this.pause.isPaused) return;
      while (p.x - d.lastX >= DRAG_STEP) {
        this.shift(1);
        d.lastX += DRAG_STEP;
        d.moved = true;
      }
      while (d.lastX - p.x >= DRAG_STEP) {
        this.shift(-1);
        d.lastX -= DRAG_STEP;
        d.moved = true;
      }
      while (p.y - d.lastY >= DRAG_STEP) {
        this.softDropStep();
        d.lastY += DRAG_STEP;
        d.moved = true;
      }
    });
    // Handle releases outside the canvas too, so a finger that slides off the edge still counts.
    const release = (p: Phaser.Input.Pointer) => {
      const d = this.drag;
      this.drag = null;
      if (!d || this.state !== 'playing' || this.pause.isPaused) return;
      const flickUp = d.startY - p.y > 50 && this.time.now - d.t < 350;
      if (flickUp) this.hardDrop();
      else if (!d.moved && Math.abs(p.y - d.startY) < 12) this.rotate(1);
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);
  }

  // ---------------------------------------------------------------- loop

  update(_time: number, delta: number): void {
    if (this.pause.isPaused) return;
    if (this.state === 'playing') {
      this.handleInput(delta);
      if (this.state === 'playing') this.applyGravity(delta);
    }
    this.render();
  }

  private handleInput(delta: number): void {
    const c = this.controls;
    if (c.justPressed('hold')) this.hold();
    if (c.justPressed('rotCW')) this.rotate(1);
    if (c.justPressed('rotCCW')) this.rotate(-1);
    if (c.justPressed('drop')) {
      this.hardDrop();
      return;
    }

    // Horizontal movement with delayed auto shift, like a real cabinet.
    const held = c.isDown('left') ? -1 : c.isDown('right') ? 1 : 0;
    if (c.justPressed('left') || c.justPressed('right')) {
      const dir = c.justPressed('left') ? -1 : 1;
      this.shift(dir);
      this.dasDir = dir;
      this.dasTimer = 0;
      this.arrTimer = 0;
    } else if (held !== 0 && held === this.dasDir) {
      this.dasTimer += delta;
      if (this.dasTimer >= DAS_MS) {
        this.arrTimer += delta;
        while (this.arrTimer >= ARR_MS) {
          this.arrTimer -= ARR_MS;
          if (!this.shift(held)) break;
        }
      }
    } else if (held === 0) {
      this.dasDir = 0;
    }
  }

  private applyGravity(delta: number): void {
    const soft = this.controls.isDown('down');
    const interval = soft ? Math.min(gravitySeconds(this.level), SOFT_DROP_SECONDS) : gravitySeconds(this.level);
    this.gravityAcc += delta / 1000;
    while (this.gravityAcc >= interval) {
      this.gravityAcc -= interval;
      const moved = tryMove(this.board, this.piece, 0, 1);
      if (!moved) {
        this.gravityAcc = 0;
        break;
      }
      this.setPiece(moved);
      if (soft) this.score++;
    }

    const grounded = collides(this.board, { ...this.piece, y: this.piece.y + 1 });
    if (grounded) {
      this.lockTimer += delta;
      if (this.lockTimer >= LOCK_DELAY_MS) this.lockPiece();
    } else {
      this.lockTimer = 0;
    }
    this.updateHud();
  }

  // ---------------------------------------------------------------- actions

  /** Replaces the active piece, tracking the lowest row reached (a new low resets lock resets). */
  private setPiece(p: Piece): void {
    if (p.y > this.lowestY) {
      this.lowestY = p.y;
      this.lockResets = 0;
      this.lockTimer = 0;
    }
    this.piece = p;
  }

  /** Moving or rotating while grounded buys more time, up to MAX_LOCK_RESETS. */
  private afterManipulation(): void {
    if (this.lockResets < MAX_LOCK_RESETS) {
      this.lockTimer = 0;
      this.lockResets++;
    }
  }

  private shift(dir: number): boolean {
    if (this.state !== 'playing') return false;
    const moved = tryMove(this.board, this.piece, dir, 0);
    if (!moved) return false;
    this.setPiece(moved);
    this.afterManipulation();
    tone({ freq: 300, duration: 0.025, type: 'square', volume: 0.025 });
    return true;
  }

  private softDropStep(): void {
    const moved = tryMove(this.board, this.piece, 0, 1);
    if (moved) {
      this.setPiece(moved);
      this.score++;
    }
  }

  private rotate(dir: 1 | -1): void {
    if (this.state !== 'playing') return;
    const rotated = tryRotate(this.board, this.piece, dir);
    if (!rotated) return;
    this.setPiece(rotated);
    this.afterManipulation();
    tone({ freq: dir === 1 ? 520 : 440, duration: 0.04, type: 'triangle', volume: 0.05 });
  }

  private hardDrop(): void {
    if (this.state !== 'playing') return;
    const d = dropDistance(this.board, this.piece);
    const from = cellsOf(this.piece);
    this.setPiece({ ...this.piece, y: this.piece.y + d });
    this.score += d * 2;
    // Streak effect from where the piece started.
    const color = PIECE_COLORS[this.piece.type];
    for (const c of from) {
      if (c.y + d < HIDDEN_ROWS) continue;
      const x = BOARD_X + c.x * CELL + CELL / 2;
      const top = BOARD_Y + Math.max(c.y - HIDDEN_ROWS, 0) * CELL;
      const streak = this.add.rectangle(x, top, CELL - 10, d * CELL, color, 0.25).setOrigin(0.5, 0);
      this.tweens.add({ targets: streak, alpha: 0, duration: 180, onComplete: () => streak.destroy() });
    }
    this.cameras.main.shake(70, 0.003 + Math.min(d, 18) * 0.0002);
    tone({ freq: 180, toFreq: 70, duration: 0.12, type: 'sawtooth', volume: 0.07 });
    this.lockPiece();
  }

  private hold(): void {
    if (!this.canHold || this.state !== 'playing') return;
    const current = this.piece.type;
    if (this.holdType) this.enter(this.holdType);
    else this.spawnNext();
    this.holdType = current;
    this.canHold = false;
    tone({ freq: 660, toFreq: 440, duration: 0.08, type: 'triangle', volume: 0.06 });
  }

  private spawnNext(): void {
    this.enter(this.bag.next());
    this.canHold = true;
  }

  /** Puts a new piece at the top. Topping out (no room to spawn) ends the game. */
  private enter(type: PieceType): void {
    let p = spawn(type);
    if (collides(this.board, p)) {
      this.piece = p;
      this.gameOver();
      return;
    }
    // Drop one row straight away so the piece is visible immediately.
    p = tryMove(this.board, p, 0, 1) ?? p;
    this.piece = p;
    this.lowestY = p.y;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.gravityAcc = 0;
  }

  private lockPiece(): void {
    const lockedOut = lock(this.board, this.piece);
    tone({ freq: 140, duration: 0.06, type: 'square', volume: 0.05 });
    if (lockedOut) {
      this.gameOver();
      return;
    }
    const rows = fullRows(this.board);
    if (rows.length === 0) {
      this.combo = -1;
      this.spawnNext();
      return;
    }
    this.startClear(rows);
  }

  private startClear(rows: number[]): void {
    this.state = 'clearing';
    this.clearingRows = rows;
    const n = rows.length;

    this.combo++;
    const b2b = n === 4 && this.backToBack;
    let points = LINE_POINTS[n] * this.level;
    if (b2b) points = Math.floor(points * 1.5);
    if (this.combo > 0) points += 50 * this.combo * this.level;
    this.backToBack = n === 4;
    this.score += points;

    for (const y of rows) {
      if (y < HIDDEN_ROWS) continue;
      for (let x = 0; x < COLS; x++) {
        const type = this.board[y][x];
        this.burst.setParticleTint(type ? PIECE_COLORS[type] : NEON.white);
        this.burst.explode(3, BOARD_X + x * CELL + CELL / 2, BOARD_Y + (y - HIDDEN_ROWS) * CELL + CELL / 2);
      }
    }
    const label = [CLEAR_NAMES[n], b2b ? 'BACK TO BACK' : '', this.combo > 0 ? `COMBO ${this.combo}` : '']
      .filter(Boolean)
      .join('\n');
    showBanner(this, `${label}\n+${points}`, n === 4 ? NEON.yellow : NEON.cyan, BOARD_Y + BOARD_H / 2);
    this.cameras.main.shake(90 + n * 40, 0.003 * n);
    const notes = [523, 659, 784, 1047].slice(0, n + (n === 4 ? 0 : 1));
    notes.forEach((f, i) => this.time.delayedCall(i * 60, () => tone({ freq: f, duration: 0.12, type: 'triangle', volume: 0.08 })));

    this.time.delayedCall(220, () => {
      clearRows(this.board, rows);
      this.clearingRows = [];
      const before = this.level;
      this.lines += n;
      this.level = 1 + Math.floor(this.lines / LINES_PER_LEVEL);
      if (this.level > before) {
        showBanner(this, `LEVEL ${this.level}`, NEON.green, BOARD_Y + 120);
        [392, 523, 659, 784, 1047].forEach((f, i) => this.time.delayedCall(250 + i * 70, () => tone({ freq: f, duration: 0.1, volume: 0.07 })));
      }
      this.state = 'playing';
      this.spawnNext();
      this.updateHud();
    });
  }

  private gameOver(): void {
    if (this.state === 'over') return;
    this.state = 'over';
    this.cameras.main.shake(300, 0.01);
    noise(0.5, 0.1);
    tone({ freq: 400, toFreq: 40, duration: 0.9, type: 'sawtooth', volume: 0.08 });
    // Grey out the stack from the bottom up.
    for (let i = 0; i < VISIBLE_ROWS; i++) {
      this.time.delayedCall(i * 45, () => {
        this.greyRows = i + 1;
      });
    }
    this.time.delayedCall(VISIBLE_ROWS * 45 + 900, () =>
      this.scene.start('GameOver', {
        gameId: GAME_ID,
        score: this.score,
        detail: `LEVEL ${this.level}   LINES ${this.lines}`,
      }),
    );
  }

  // ---------------------------------------------------------------- render

  private render(): void {
    const g = this.gfx.clear();

    for (let y = HIDDEN_ROWS; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const t = this.board[y][x];
        if (!t) continue;
        const color = y >= ROWS - this.greyRows ? 0x3a3a55 : PIECE_COLORS[t];
        this.drawCell(g, BOARD_X + x * CELL, BOARD_Y + (y - HIDDEN_ROWS) * CELL, CELL, color, 1);
      }
    }

    if (this.state === 'playing') {
      const color = PIECE_COLORS[this.piece.type];
      const ghostY = this.piece.y + dropDistance(this.board, this.piece);
      for (const c of cellsOf({ ...this.piece, y: ghostY })) {
        if (c.y < HIDDEN_ROWS) continue;
        g.lineStyle(2, color, 0.45).strokeRoundedRect(BOARD_X + c.x * CELL + 2, BOARD_Y + (c.y - HIDDEN_ROWS) * CELL + 2, CELL - 4, CELL - 4, 4);
      }
      // Pulse slightly as the lock timer runs out.
      const lockAlpha = 1 - (this.lockTimer / LOCK_DELAY_MS) * 0.35;
      for (const c of cellsOf(this.piece)) {
        if (c.y < HIDDEN_ROWS) continue;
        this.drawCell(g, BOARD_X + c.x * CELL, BOARD_Y + (c.y - HIDDEN_ROWS) * CELL, CELL, color, lockAlpha);
      }
    }

    for (const y of this.clearingRows) {
      if (y >= HIDDEN_ROWS) g.fillStyle(0xffffff, 0.85).fillRect(BOARD_X, BOARD_Y + (y - HIDDEN_ROWS) * CELL, BOARD_W, CELL);
    }

    if (this.holdType) this.drawMini(g, this.holdType, LEFT_PANEL_X + 75, BOARD_Y + 85, this.canHold ? 1 : 0.35);
    this.bag.peek(NEXT_PREVIEW).forEach((t, i) => this.drawMini(g, t, RIGHT_PANEL_X + 75, BOARD_Y + 85 + i * 90, i === 0 ? 1 : 0.7));
  }

  private drawCell(g: Phaser.GameObjects.Graphics, x: number, y: number, size: number, color: number, alpha: number): void {
    g.fillStyle(color, 0.18 * alpha).fillRoundedRect(x - 1, y - 1, size + 2, size + 2, 5);
    g.fillStyle(color, 0.9 * alpha).fillRoundedRect(x + 2, y + 2, size - 4, size - 4, 4);
    g.fillStyle(0xffffff, 0.35 * alpha).fillRoundedRect(x + 4, y + 4, size - 8, Math.max(size * 0.18, 3), 2);
  }

  /** Small centered preview of a piece for the hold and next panels. */
  private drawMini(g: Phaser.GameObjects.Graphics, type: PieceType, cx: number, cy: number, alpha: number): void {
    const m = ROTATIONS[type][0];
    const cells: { x: number; y: number }[] = [];
    m.forEach((row, r) => row.forEach((v, c) => v && cells.push({ x: c, y: r })));
    const minX = Math.min(...cells.map((c) => c.x));
    const maxX = Math.max(...cells.map((c) => c.x));
    const minY = Math.min(...cells.map((c) => c.y));
    const maxY = Math.max(...cells.map((c) => c.y));
    const size = 20;
    const ox = cx - ((maxX - minX + 1) * size) / 2;
    const oy = cy - ((maxY - minY + 1) * size) / 2;
    for (const c of cells) this.drawCell(g, ox + (c.x - minX) * size, oy + (c.y - minY) * size, size, PIECE_COLORS[type], alpha);
  }

  private updateHud(): void {
    this.scoreText.setText(this.score.toLocaleString());
    this.levelText.setText(String(this.level));
    this.linesText.setText(String(this.lines));
  }
}
