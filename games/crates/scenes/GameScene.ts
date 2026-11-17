import Phaser from 'phaser';
import { BOARD, GAME_ID, HEIGHT, MAX_CELL, REPEAT_DELAY_MS, SOLVED_MS, STEP_MS, WIDTH } from '../config';
import { EXTRA_CONTROLS } from '../controls';
import { LEVELS } from '../levels';
import { loadProgress, parCount, type Progress, recordSolve, saveProgress, solvedCount, totalScore } from '../progress';
import { DIRS, type Dir, type Level, type MoveResult, parseLevel, Puzzle } from '../rules';
import type { TROPHIES } from '../trophies';
import { trophiesFor } from '../../../shared/achievements';
import { ArcadeControls } from '../../../shared/controls';
import { PauseController } from '../../../shared/pause';
import { endRun, finishRun, SCENE } from '../../../shared/scenes';
import { keyLabel } from '../../../shared/settings';
import { tone } from '../../../shared/sfx';
import { isTouchDevice, onSwipe, VirtualButton } from '../../../shared/touch';
import { burstEmitter, drawGrid, hex, HUD_LABEL_STYLE, HUD_STYLE, NEON, reducedMotion, showBanner } from '../../../shared/ui';
import { SELECT_SCENE } from './SelectScene';

const { unlock, reach } = trophiesFor<typeof TROPHIES>();

type Extra = keyof typeof EXTRA_CONTROLS;
type Phase = 'play' | 'solved';

/** Base size of the generated textures; they are scaled to the level's cell size. */
const TEX = 64;
/** Moves queued ahead of the animation, so quick taps and swipes are never lost. */
const QUEUE_MAX = 3;

/** A crate on screen: its glow and body move together, and `cell` is where it stands in the rules. */
interface CrateView {
  cell: number;
  box: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  home: boolean;
}

export class GameScene extends Phaser.Scene {
  private index = 0;
  private level!: Level;
  private puzzle!: Puzzle;
  private progress: Progress = {};
  private phase: Phase = 'play';

  private cell = MAX_CELL;
  private originX = 0;
  private originY = 0;

  private robot!: Phaser.GameObjects.Image;
  private crates: CrateView[] = [];
  private burst!: Phaser.GameObjects.Particles.ParticleEmitter;
  private movesText!: Phaser.GameObjects.Text;
  private pushesText!: Phaser.GameObjects.Text;
  private bestText!: Phaser.GameObjects.Text;

  private controls!: ArcadeControls<Extra>;
  private pause!: PauseController;
  private buttons: VirtualButton[] = [];
  private queue: Array<Dir | 'undo'> = [];
  /** When the robot's current step animation ends (scene clock, ms). */
  private busyUntil = 0;
  /** The held direction or undo, and when it next repeats. */
  private held: { key: Dir | 'undo'; at: number } | null = null;
  private readyAt = 0;

  constructor() {
    super(SCENE.game);
  }

  init(data: { level?: number }): void {
    this.index = typeof data.level === 'number' && LEVELS[data.level] ? data.level : 0;
    this.phase = 'play';
    this.queue = [];
    this.held = null;
    this.crates = [];
    this.buttons = [];
    this.busyUntil = 0;
  }

  create(): void {
    this.cameras.main.fadeIn(250, 5, 5, 13);
    drawGrid(this, WIDTH, HEIGHT);
    this.makeTextures();
    this.progress = loadProgress();
    const def = LEVELS[this.index];
    this.level = parseLevel(def.map);
    this.puzzle = new Puzzle(this.level);

    this.cell = Math.floor(Math.min(MAX_CELL, BOARD.width / this.level.width, BOARD.height / this.level.height));
    this.originX = Math.round(BOARD.x + (BOARD.width - this.cell * this.level.width) / 2);
    this.originY = Math.round(BOARD.y + (BOARD.height - this.cell * this.level.height) / 2);

    this.drawBoard();
    this.makePieces();
    this.burst = burstEmitter(this, 200, 550);
    this.makeHud();

    this.controls = new ArcadeControls<Extra>(this, EXTRA_CONTROLS);
    this.pause = new PauseController(this, this.controls, { canPause: () => this.phase === 'play' });
    if (isTouchDevice()) {
      const undo = new VirtualButton(this, 70, HEIGHT - 52, 'UNDO', NEON.cyan, 34);
      const restart = new VirtualButton(this, 160, HEIGHT - 52, 'RESET', NEON.pink, 30);
      this.controls.addVirtual('undo', () => undo.isDown);
      this.controls.addVirtual('restart', () => restart.isDown);
      this.buttons = [undo, restart];
    }
    onSwipe(this, (d) => d !== 'tap' && this.enqueue(d), {
      threshold: Math.max(20, this.cell * 0.6),
      continuous: true,
      ignore: () => this.pause.isPaused || this.onButton(this.input.activePointer),
    });
    // A button still held from the level select would otherwise count as a fresh press.
    this.readyAt = this.time.now + 250;
    this.refreshHud();
    showBanner(this, `${this.index + 1}. ${def.name.toUpperCase()}`, NEON.orange, HEIGHT / 2);
  }

  // ---------------------------------------------------------------- input

  update(): void {
    // The scene clock, which the step timings below are measured on.
    const now = this.time.now;
    if (this.pause.isPaused || now < this.readyAt) return;
    if (this.phase !== 'play') return;
    this.readInput(now);
    if (now >= this.busyUntil && this.queue.length) {
      const next = this.queue.shift()!;
      if (next === 'undo') this.undo();
      else this.step(next);
    }
  }

  private readInput(now: number): void {
    const c = this.controls;
    if (c.justPressed('restart')) {
      this.restart();
      return;
    }
    if (c.justPressed('undo')) this.press('undo', now);
    for (const d of DIRS) if (c.justPressed(d)) this.press(d, now);

    // Holding a direction (or undo) repeats it once the first step is done.
    const key = this.held?.key;
    const down = key === 'undo' ? c.isDown('undo') : key ? c.isDown(key) : false;
    if (!down) this.held = null;
    else if (this.held && now >= this.held.at && now >= this.busyUntil && this.queue.length === 0) {
      this.enqueue(this.held.key);
      this.held.at = now + STEP_MS;
    }
  }

  private press(key: Dir | 'undo', now: number): void {
    this.enqueue(key);
    this.held = { key, at: now + REPEAT_DELAY_MS };
  }

  private enqueue(key: Dir | 'undo'): void {
    if (this.phase !== 'play' || this.queue.length >= QUEUE_MAX) return;
    this.queue.push(key);
  }

  private onButton(p: Phaser.Input.Pointer): boolean {
    return this.buttons.some((b) => b.contains(p.x, p.y));
  }

  // ---------------------------------------------------------------- moves

  private step(dir: Dir): void {
    const result = this.puzzle.move(dir);
    if (!result) {
      this.bump(dir);
      return;
    }
    this.animate(result);
    this.refreshHud();
    if (this.puzzle.solved) this.solve();
  }

  private animate(result: MoveResult): void {
    const duration = STEP_MS;
    this.busyUntil = this.time.now + duration;
    this.moveRobot(result.to, duration);
    if (!result.push) {
      tone({ freq: 220, duration: 0.03, type: 'triangle', volume: 0.025 });
      return;
    }
    const crate = this.crates.find((c) => c.cell === result.push!.from)!;
    this.moveCrate(crate, result.push.to, duration);
    tone({ freq: 140, toFreq: 110, duration: 0.08, type: 'square', volume: 0.04 });
  }

  private undo(): void {
    const before = this.puzzle.state;
    const left = this.puzzle.undo();
    if (!left) {
      tone({ freq: 160, duration: 0.05, type: 'square', volume: 0.03 });
      return;
    }
    const duration = STEP_MS * 0.8;
    this.busyUntil = this.time.now + duration;
    const after = this.puzzle.state;
    this.moveRobot(after.player, duration);
    // At most one crate moved in the step being taken back.
    const from = before.crates.find((c) => !after.crates.includes(c));
    const to = after.crates.find((c) => !before.crates.includes(c));
    if (from !== undefined && to !== undefined) this.moveCrate(this.crates.find((c) => c.cell === from)!, to, duration);
    tone({ freq: 520, toFreq: 380, duration: 0.06, type: 'triangle', volume: 0.035 });
    this.refreshHud();
  }

  private restart(): void {
    if (this.puzzle.moves === 0) return;
    this.puzzle.restart();
    this.queue = [];
    this.held = null;
    this.tweens.killTweensOf([this.robot, ...this.crates.map((c) => c.box)]);
    this.busyUntil = 0;
    this.robot.setPosition(this.cx(this.level.start.player), this.cy(this.level.start.player));
    this.level.start.crates.forEach((cell, i) => this.placeCrate(this.crates[i], cell));
    tone({ freq: 660, toFreq: 220, duration: 0.15, type: 'sawtooth', volume: 0.04 });
    this.refreshHud();
  }

  /** A blocked step: the robot leans into the wall and springs back. */
  private bump(dir: Dir): void {
    const d = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[dir];
    const x = this.cx(this.puzzle.state.player);
    const y = this.cy(this.puzzle.state.player);
    this.busyUntil = this.time.now + 90;
    this.tweens.add({ targets: this.robot, x: x + d[0] * this.cell * 0.12, y: y + d[1] * this.cell * 0.12, duration: 45, yoyo: true, onComplete: () => this.robot.setPosition(x, y) });
    tone({ freq: 90, duration: 0.05, type: 'square', volume: 0.03 });
  }

  private solve(): void {
    this.phase = 'solved';
    this.queue = [];
    const def = LEVELS[this.index];
    const moves = this.puzzle.moves;
    const { progress, improved } = recordSolve(this.progress, def.name, moves);
    this.progress = progress;
    if (improved) saveProgress(progress);

    unlock('crates.first');
    if (moves <= def.par) unlock('crates.par');
    reach('crates.half', solvedCount(progress));
    reach('crates.all', solvedCount(progress));
    // Every solve is a play with the score so far. The last level records it on the game-over screen instead (see next).
    if (this.index + 1 < LEVELS.length) finishRun(GAME_ID, totalScore(progress));

    const atPar = moves <= def.par;
    const message = atPar ? 'PAR! PERFECT' : improved ? 'SOLVED  NEW BEST' : 'SOLVED';
    this.time.delayedCall(STEP_MS, () => {
      showBanner(this, message, atPar ? NEON.yellow : NEON.green, HEIGHT / 2);
      [523, 659, 784, 1047].forEach((f, i) => this.time.delayedCall(i * 110, () => tone({ freq: f, duration: 0.16, type: 'triangle', volume: 0.08 })));
      if (!reducedMotion()) for (const c of this.crates) this.tweens.add({ targets: c.box, scale: 1.12, duration: 160, yoyo: true, delay: 80 });
    });
    this.time.delayedCall(SOLVED_MS, () => this.next());
  }

  /** On to the next level, or, after the last one, the summary on the shared game-over screen. */
  private next(): void {
    if (this.index + 1 < LEVELS.length) {
      this.cameras.main.fadeOut(250, 5, 5, 13);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.restart({ level: this.index + 1 }));
      return;
    }
    const p = this.progress;
    endRun(this, {
      gameId: GAME_ID,
      score: totalScore(p),
      detail: `${solvedCount(p)} / ${LEVELS.length} SOLVED    ${parCount(p)} AT PAR`,
      restartScene: SELECT_SCENE,
      restartData: {},
    });
  }

  // ---------------------------------------------------------------- drawing

  private cx(cell: number): number {
    return this.originX + (cell % this.level.width) * this.cell + this.cell / 2;
  }

  private cy(cell: number): number {
    return this.originY + Math.floor(cell / this.level.width) * this.cell + this.cell / 2;
  }

  private moveRobot(cell: number, duration: number): void {
    this.tweens.killTweensOf(this.robot);
    this.tweens.add({ targets: this.robot, x: this.cx(cell), y: this.cy(cell), duration, ease: 'Sine.easeOut' });
  }

  private moveCrate(crate: CrateView, cell: number, duration: number): void {
    this.tweens.killTweensOf(crate.box);
    crate.cell = cell;
    this.tweens.add({ targets: crate.box, x: this.cx(cell), y: this.cy(cell), scale: 1, duration, ease: 'Sine.easeOut' });
    this.paintCrate(crate, true);
  }

  private placeCrate(crate: CrateView, cell: number): void {
    crate.cell = cell;
    crate.box.setPosition(this.cx(cell), this.cy(cell)).setScale(1);
    this.paintCrate(crate, false);
  }

  /** Lights a crate green with a glow while it sits on a target; `announce` adds a chime and sparks. */
  private paintCrate(crate: CrateView, announce: boolean): void {
    const home = this.level.targets.includes(crate.cell);
    if (home === crate.home) return;
    crate.home = home;
    crate.body.setTint(home ? NEON.green : NEON.orange);
    this.tweens.killTweensOf(crate.glow);
    crate.glow.setTint(NEON.green);
    if (home) {
      crate.glow.setAlpha(0.9);
      if (!reducedMotion()) this.tweens.add({ targets: crate.glow, alpha: 0.45, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else {
      crate.glow.setAlpha(0);
    }
    if (announce && home) {
      this.time.delayedCall(STEP_MS, () => {
        this.burst.setParticleTint(NEON.green);
        this.burst.explode(14, this.cx(crate.cell), this.cy(crate.cell));
      });
      tone({ freq: 880, toFreq: 1320, duration: 0.1, type: 'triangle', volume: 0.06 });
    }
  }

  private makeTextures(): void {
    if (this.textures.exists('crates-crate')) return;
    const g = this.make.graphics({}, false);
    const pad = 6;
    const s = TEX - pad * 2;
    // Crate: a rounded box with a braced face, drawn white so it can be tinted.
    g.fillStyle(0xffffff, 0.22).fillRoundedRect(pad, pad, s, s, 8);
    g.lineStyle(4, 0xffffff, 1).strokeRoundedRect(pad, pad, s, s, 8);
    g.lineStyle(3, 0xffffff, 0.8).strokeRect(pad + 10, pad + 10, s - 20, s - 20);
    g.lineBetween(pad + 10, pad + 10, pad + s - 10, pad + s - 10).lineBetween(pad + s - 10, pad + 10, pad + 10, pad + s - 10);
    g.generateTexture('crates-crate', TEX, TEX);
    // Glow: soft stacked squares that spill a little past the cell.
    g.clear();
    for (let i = 0; i < 6; i++) g.fillStyle(0xffffff, 0.07).fillRoundedRect(i * 2, i * 2, TEX + 16 - i * 4, TEX + 16 - i * 4, 14);
    g.generateTexture('crates-glow', TEX + 16, TEX + 16);
    // Robot: a round body with a visor.
    g.clear();
    const c = TEX / 2;
    g.fillStyle(0xffffff, 0.25).fillCircle(c, c, 24);
    g.lineStyle(4, 0xffffff, 1).strokeCircle(c, c, 22);
    g.fillStyle(0xffffff, 1).fillRoundedRect(c - 14, c - 8, 28, 10, 4);
    g.fillStyle(0x05050d, 1).fillCircle(c - 7, c - 3, 3).fillCircle(c + 7, c - 3, 3);
    g.generateTexture('crates-robot', TEX, TEX);
    g.destroy();
  }

  private drawBoard(): void {
    const { width, height, walls, floor, targets } = this.level;
    const s = this.cell;
    const g = this.add.graphics();
    const isFloor = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && floor[y * width + x];
    for (let i = 0; i < walls.length; i++) {
      if (!floor[i]) continue;
      const x = this.originX + (i % width) * s;
      const y = this.originY + Math.floor(i / width) * s;
      g.fillStyle(NEON.purple, 0.07).fillRect(x, y, s, s);
      g.lineStyle(1, NEON.purple, 0.15).strokeRect(x, y, s, s);
    }
    // Walls that touch the room are outlined along the floor, tracing it in neon tubes.
    for (const [lineW, alpha] of [[7, 0.18], [2, 1]] as const) {
      g.lineStyle(lineW, NEON.blue, alpha);
      for (let i = 0; i < walls.length; i++) {
        if (!walls[i]) continue;
        const gx = i % width;
        const gy = Math.floor(i / width);
        const x = this.originX + gx * s;
        const y = this.originY + gy * s;
        if (isFloor(gx, gy - 1)) g.lineBetween(x, y, x + s, y);
        if (isFloor(gx, gy + 1)) g.lineBetween(x, y + s, x + s, y + s);
        if (isFloor(gx - 1, gy)) g.lineBetween(x, y, x, y + s);
        if (isFloor(gx + 1, gy)) g.lineBetween(x + s, y, x + s, y + s);
      }
    }
    for (let i = 0; i < walls.length; i++) {
      if (!walls[i]) continue;
      const gx = i % width;
      const gy = Math.floor(i / width);
      const touches = [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => isFloor(gx + dx, gy + dy)));
      if (touches) g.fillStyle(NEON.blue, 0.1).fillRect(this.originX + gx * s, this.originY + gy * s, s, s);
    }
    for (const t of targets) {
      const r = s * 0.2;
      g.lineStyle(6, NEON.pink, 0.2).strokeCircle(this.cx(t), this.cy(t), r);
      g.lineStyle(2, NEON.pink, 1).strokeCircle(this.cx(t), this.cy(t), r);
      g.fillStyle(NEON.pink, 0.8).fillCircle(this.cx(t), this.cy(t), r * 0.35);
    }
  }

  private makePieces(): void {
    const scale = this.cell / TEX;
    this.crates = this.level.start.crates.map((cell) => {
      const glow = this.add.image(0, 0, 'crates-glow').setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
      const body = this.add.image(0, 0, 'crates-crate').setTint(NEON.orange);
      const box = this.add.container(0, 0, [glow, body]);
      glow.setScale(scale);
      body.setScale(scale);
      const view: CrateView = { cell, box, body, glow, home: false };
      this.placeCrate(view, cell);
      return view;
    });
    this.robot = this.add.image(this.cx(this.level.start.player), this.cy(this.level.start.player), 'crates-robot').setTint(NEON.cyan).setScale(scale * 0.9);
  }

  private makeHud(): void {
    const def = LEVELS[this.index];
    this.add.text(40, 20, `LEVEL ${this.index + 1} / ${LEVELS.length}`, HUD_LABEL_STYLE);
    this.add.text(40, 36, def.name.toUpperCase(), { ...HUD_STYLE, fontSize: '14px', color: hex(NEON.orange) });
    this.add.text(330, 20, 'MOVES', HUD_LABEL_STYLE);
    this.movesText = this.add.text(330, 36, '0', HUD_STYLE);
    this.add.text(450, 20, 'PUSHES', HUD_LABEL_STYLE);
    this.pushesText = this.add.text(450, 36, '0', HUD_STYLE);
    this.add.text(WIDTH - 150, 20, `PAR ${def.par}`, HUD_LABEL_STYLE);
    this.bestText = this.add.text(WIDTH - 150, 36, '', HUD_STYLE);
    const help = isTouchDevice() ? 'SWIPE TO MOVE' : `UNDO Z / BACKSPACE    RESTART R    PAUSE ${keyLabel('pause')}`;
    this.add.text(WIDTH / 2, HEIGHT - 30, help, HUD_LABEL_STYLE).setOrigin(0.5);
  }

  private refreshHud(): void {
    this.movesText.setText(String(this.puzzle.moves));
    this.pushesText.setText(String(this.puzzle.pushes));
    const best = this.progress[LEVELS[this.index].name];
    this.bestText.setText(best === undefined ? 'BEST -' : `BEST ${best}`);
  }
}
