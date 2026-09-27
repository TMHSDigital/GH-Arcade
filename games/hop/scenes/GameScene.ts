import Phaser from 'phaser';
import {
  CELL,
  COLS,
  DOCK_COLS,
  DOCK_WIDTH,
  GAME_ID,
  GRID_X,
  GRID_Y,
  HEIGHT,
  HOP_MS,
  LANES,
  POINTS_DOCK,
  POINTS_FULL_HOUSE,
  POINTS_ORB,
  POINTS_PER_SECOND_LEFT,
  POINTS_STEP,
  SPEED_PER_LEVEL,
  START_COL,
  START_LIVES,
  START_ROW,
  TIME_LIMIT,
  WIDTH,
} from '../config';
import { unlock } from '../../../shared/achievements';
import { ArcadeControls } from '../../../shared/controls';
import { PauseController } from '../../../shared/pause';
import { noise, tone } from '../../../shared/sfx';
import { onSwipe } from '../../../shared/touch';
import { burstEmitter, floatText, NEON, PIXEL_FONT, showBanner } from '../../../shared/ui';

interface Item {
  /** Left edge in pixels (relative to the grid), wraps around. */
  x: number;
  w: number;
  /** Turtles only: phase offset for diving. */
  phase: number;
}

interface Lane {
  row: number;
  kind: (typeof LANES)[number]['kind'];
  item?: string;
  speed: number;
  items: Item[];
}

const GRID_W = COLS * CELL;
/** Items wrap across the grid plus this margin, so they slide fully off before reappearing. */
const WRAP_MARGIN = CELL * 3;
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] } as const;
type DirName = keyof typeof DIRS;

const rowY = (row: number) => GRID_Y + row * CELL;

export class GameScene extends Phaser.Scene {
  private lanes: Lane[] = [];
  private docks: boolean[] = [];
  private orbDock = -1;
  private orbUntil = 0;

  /** Player position: x in pixels within the grid (floats while riding), row on the grid. */
  private px = 0;
  private row = START_ROW;
  private hop: { fromX: number; fromRow: number; t: number } | null = null;
  private facing: DirName = 'up';
  private queued: DirName | null = null;
  private alive = true;
  private furthest = START_ROW;

  private score = 0;
  private lives = START_LIVES;
  private level = 1;
  private timeLeft = TIME_LIMIT;
  private elapsed = 0;
  private over = false;
  private busy = false;

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
    this.elapsed = 0;
    this.over = false;
    this.busy = false;
    this.orbDock = -1;
  }

  create(): void {
    this.cameras.main.fadeIn(250, 5, 5, 13);
    this.gfx = this.add.graphics();
    this.burst = burstEmitter(this, 240, 600);
    const style = { fontFamily: PIXEL_FONT, fontSize: '16px', color: '#e8e8ff' };
    this.scoreText = this.add.text(WIDTH / 2, 24, '0', style).setOrigin(0.5).setDepth(10);
    this.levelText = this.add.text(WIDTH - 20, 24, '', { ...style, fontSize: '12px' }).setOrigin(1, 0.5).setDepth(10);

    this.controls = new ArcadeControls(this);
    this.pause = new PauseController(this, this.controls, { canPause: () => !this.over });
    // Swipe to hop in that direction; a tap hops forward.
    onSwipe(this, (d) => this.tryHop(d === 'tap' ? 'up' : d), { threshold: 20 });

    this.startLevel();
  }

  private startLevel(): void {
    const speedFactor = 1 + (this.level - 1) * SPEED_PER_LEVEL;
    this.lanes = LANES.map((spec, row) => {
      const lane: Lane = { row, kind: spec.kind, item: spec.item, speed: (spec.speed ?? 0) * speedFactor, items: [] };
      if (spec.item && spec.length && spec.count) {
        const span = GRID_W + WRAP_MARGIN * 2;
        const w = spec.length * CELL;
        const spacing = span / spec.count;
        const offset = Phaser.Math.Between(0, Math.floor(spacing));
        for (let i = 0; i < spec.count; i++) lane.items.push({ x: -WRAP_MARGIN + offset + i * spacing, w, phase: Math.random() * 6 });
      }
      return lane;
    });
    this.docks = DOCK_COLS.map(() => false);
    this.levelText.setText(`LV ${this.level}`);
    this.resetHopper();
    showBanner(this, `LEVEL ${this.level}`, NEON.cyan, HEIGHT / 2);
  }

  private resetHopper(): void {
    this.px = START_COL * CELL + CELL / 2;
    this.row = START_ROW;
    this.hop = null;
    this.queued = null;
    this.facing = 'up';
    this.alive = true;
    this.busy = false;
    this.furthest = START_ROW;
    this.timeLeft = TIME_LIMIT;
  }

  // ---------------------------------------------------------------- input

  private tryHop(dir: DirName): void {
    if (!this.alive || this.over || this.busy || this.pause.isPaused) return;
    if (this.hop) {
      this.queued = dir;
      return;
    }
    const [dx, dy] = DIRS[dir];
    const nextRow = this.row + dy;
    // Hops snap to the nearest column, so riding a log never leaves you between cells.
    const col = Phaser.Math.Clamp(Math.round((this.px - CELL / 2) / CELL) + dx, 0, COLS - 1);
    if (nextRow < 0 || nextRow > START_ROW) return;
    this.facing = dir;
    this.hop = { fromX: this.px, fromRow: this.row, t: 0 };
    this.px = col * CELL + CELL / 2;
    this.row = nextRow;
    tone({ freq: dy < 0 ? 520 : 420, toFreq: dy < 0 ? 760 : 560, duration: 0.05, type: 'triangle', volume: 0.05 });
    if (this.row < this.furthest) {
      this.furthest = this.row;
      this.addScore(POINTS_STEP);
    }
  }

  // ---------------------------------------------------------------- loop

  update(_time: number, deltaMs: number): void {
    if (this.pause.isPaused) return;
    const dt = Math.min(deltaMs, 50) / 1000;
    this.elapsed += deltaMs;
    for (const name of Object.keys(DIRS) as DirName[]) if (this.controls.justPressed(name)) this.tryHop(name);
    if (this.controls.justPressed('action')) this.tryHop('up');

    this.moveLanes(dt);
    if (this.orbDock >= 0 && this.elapsed > this.orbUntil) this.orbDock = -1;
    if (this.orbDock < 0 && Math.random() < dt / 9) this.placeOrb();

    if (this.alive && !this.busy && !this.over) {
      if (this.hop) {
        this.hop.t += deltaMs / HOP_MS;
        if (this.hop.t >= 1) {
          this.hop = null;
          this.land();
          if (this.queued && this.alive && !this.busy) {
            const q = this.queued;
            this.queued = null;
            this.tryHop(q);
          }
        }
      } else {
        this.checkGround(dt);
      }
      this.timeLeft -= dt;
      if (this.timeLeft <= 0 && this.alive && !this.busy) this.die('TIME UP');
    }
    this.render();
  }

  private moveLanes(dt: number): void {
    const span = GRID_W + WRAP_MARGIN * 2;
    for (const lane of this.lanes) {
      for (const it of lane.items) {
        it.x += lane.speed * dt;
        if (it.x > GRID_W + WRAP_MARGIN) it.x -= span;
        else if (it.x + it.w < -WRAP_MARGIN) it.x += span;
      }
    }
  }

  /** Turtle groups spend part of each cycle underwater (from level 2), where they can't be stood on. */
  private submerged(it: Item): boolean {
    if (this.level < 2) return false;
    return Math.sin(this.elapsed / 900 + it.phase) > 0.75;
  }

  private itemUnder(lane: Lane, x: number, pad: number): Item | undefined {
    return lane.items.find((it) => x > it.x + pad && x < it.x + it.w - pad && !(lane.item === 'turtle' && this.submerged(it)));
  }

  /** Continuous checks while standing: traffic, riding platforms and drifting off the edge. */
  private checkGround(dt: number): void {
    const lane = this.lanes[this.row];
    if (lane.kind === 'road') {
      // A few pixels of forgiveness at car bumpers.
      if (lane.items.some((it) => this.px + CELL * 0.3 > it.x + 4 && this.px - CELL * 0.3 < it.x + it.w - 4)) this.die('SPLAT');
    } else if (lane.kind === 'river') {
      const ride = this.itemUnder(lane, this.px, 2);
      if (!ride) {
        this.die('SPLASH');
        return;
      }
      this.px += lane.speed * dt;
      if (this.px < CELL * 0.25 || this.px > GRID_W - CELL * 0.25) this.die('SWEPT AWAY');
    }
  }

  private land(): void {
    const lane = this.lanes[this.row];
    if (lane.kind === 'goal') {
      this.reachGoal();
      return;
    }
    this.checkGround(0);
  }

  private reachGoal(): void {
    const col = Math.round((this.px - CELL / 2) / CELL);
    const dock = DOCK_COLS.findIndex((d) => col >= d && col < d + DOCK_WIDTH);
    if (dock < 0 || this.docks[dock]) {
      this.die(dock < 0 ? 'BONK' : 'TAKEN');
      return;
    }
    this.docks[dock] = true;
    // Center the hopper in the dock for the celebration.
    this.px = (DOCK_COLS[dock] + DOCK_WIDTH / 2) * CELL;
    const seconds = Math.ceil(this.timeLeft);
    let points = POINTS_DOCK + seconds * POINTS_PER_SECOND_LEFT;
    if (dock === this.orbDock) {
      points += POINTS_ORB;
      this.orbDock = -1;
    }
    this.addScore(points);
    unlock('hop.home');
    floatText(this, GRID_X + this.px, rowY(0) + CELL / 2, `+${points}`, NEON.green, 14);
    this.burst.setParticleTint(NEON.green);
    this.burst.explode(24, GRID_X + this.px, rowY(0) + CELL / 2);
    [659, 784, 988].forEach((f, i) => this.time.delayedCall(i * 80, () => tone({ freq: f, duration: 0.1, type: 'triangle', volume: 0.08 })));
    this.busy = true;

    if (this.docks.every(Boolean)) {
      unlock('hop.full');
      this.addScore(POINTS_FULL_HOUSE);
      showBanner(this, `FULL HOUSE\n+${POINTS_FULL_HOUSE}`, NEON.yellow, HEIGHT / 2);
      this.time.delayedCall(1800, () => {
        this.level++;
        if (this.level >= 3) unlock('hop.level3');
        this.startLevel();
      });
    } else {
      this.time.delayedCall(600, () => this.resetHopper());
    }
  }

  private placeOrb(): void {
    const free = this.docks.map((filled, i) => (filled ? -1 : i)).filter((i) => i >= 0);
    if (!free.length) return;
    this.orbDock = Phaser.Utils.Array.GetRandom(free);
    this.orbUntil = this.elapsed + 6000;
  }

  private die(reason: string): void {
    if (!this.alive) return;
    this.alive = false;
    this.busy = true;
    this.lives--;
    const x = GRID_X + this.px;
    const y = rowY(this.row) + CELL / 2;
    const water = reason === 'SPLASH' || reason === 'SWEPT AWAY';
    this.burst.setParticleTint(water ? NEON.cyan : NEON.pink);
    this.burst.explode(28, x, y);
    floatText(this, x, y - 20, reason, water ? NEON.cyan : NEON.pink, 12);
    this.cameras.main.shake(220, 0.01);
    noise(water ? 0.35 : 0.25, 0.1);
    tone({ freq: 360, toFreq: 60, duration: 0.5, type: 'sawtooth', volume: 0.07 });
    if (this.lives <= 0) {
      this.over = true;
      this.time.delayedCall(1400, () =>
        this.scene.start('GameOver', { gameId: GAME_ID, score: this.score, detail: `REACHED LEVEL ${this.level}` }),
      );
      return;
    }
    this.time.delayedCall(1100, () => this.resetHopper());
  }

  private addScore(points: number): void {
    this.score += points;
    if (this.score >= 5000) unlock('hop.score');
    this.scoreText.setText(this.score.toLocaleString());
  }

  // ---------------------------------------------------------------- render

  private render(): void {
    const g = this.gfx.clear();
    const gx = GRID_X;

    for (const lane of this.lanes) {
      const y = rowY(lane.row);
      if (lane.kind === 'river') {
        g.fillStyle(0x061a3a, 1).fillRect(gx, y, GRID_W, CELL);
        // Drifting wave marks.
        g.lineStyle(1, NEON.blue, 0.35);
        for (let i = 0; i < 8; i++) {
          const wx = gx + ((i * 110 + lane.speed * this.elapsed * 0.0004 * 60) % GRID_W + GRID_W) % GRID_W;
          g.lineBetween(wx, y + 14 + (i % 3) * 10, wx + 16, y + 14 + (i % 3) * 10);
        }
      } else if (lane.kind === 'road') {
        g.fillStyle(0x0c0c18, 1).fillRect(gx, y, GRID_W, CELL);
        g.lineStyle(2, NEON.yellow, 0.25);
        for (let x = 0; x < GRID_W; x += 48) g.lineBetween(gx + x + 8, y + CELL, gx + x + 28, y + CELL);
      } else if (lane.kind === 'safe') {
        g.fillStyle(0x1a0f33, 1).fillRect(gx, y, GRID_W, CELL);
        g.lineStyle(1, NEON.purple, 0.5).strokeRect(gx, y, GRID_W, CELL);
      } else {
        // Goal bank with docks.
        g.fillStyle(0x0b2a1c, 1).fillRect(gx, y, GRID_W, CELL);
        DOCK_COLS.forEach((c, i) => {
          const dx = gx + c * CELL;
          g.fillStyle(0x061a3a, 1).fillRect(dx, y + 6, DOCK_WIDTH * CELL, CELL - 6);
          g.lineStyle(2, NEON.green, 0.8).strokeRect(dx, y + 6, DOCK_WIDTH * CELL, CELL - 6);
          if (this.docks[i]) this.drawHopper(g, dx + CELL, y + CELL / 2 + 3, 'up', NEON.green, 1);
          else if (i === this.orbDock && Math.floor(this.elapsed / 200) % 2 === 0) {
            g.fillStyle(NEON.pink, 0.25).fillCircle(dx + CELL, y + CELL / 2 + 3, 14);
            g.fillStyle(NEON.pink, 1).fillCircle(dx + CELL, y + CELL / 2 + 3, 6);
          }
        });
      }

      for (const it of lane.items) {
        const x = gx + it.x;
        if (x > gx + GRID_W || x + it.w < gx) continue;
        this.drawItem(g, lane, it, x, y);
      }
    }
    // Hide anything that slid past the grid edges.
    g.fillStyle(NEON.bg, 1).fillRect(0, GRID_Y, gx, rowY(11) - GRID_Y).fillRect(gx + GRID_W, GRID_Y, WIDTH - gx - GRID_W, rowY(11) - GRID_Y);

    if (this.alive || this.busy) {
      let x = this.px;
      let y = rowY(this.row) + CELL / 2;
      let scale = 1;
      if (this.hop) {
        const t = Math.min(this.hop.t, 1);
        x = Phaser.Math.Linear(this.hop.fromX, this.px, t);
        y = Phaser.Math.Linear(rowY(this.hop.fromRow), rowY(this.row), t) + CELL / 2;
        scale = 1 + Math.sin(t * Math.PI) * 0.25;
      }
      if (this.alive) this.drawHopper(g, GRID_X + x, y, this.facing, NEON.cyan, scale);
    }

    // Timer bar.
    const frac = Phaser.Math.Clamp(this.timeLeft / TIME_LIMIT, 0, 1);
    const barY = rowY(11) + 8;
    g.fillStyle(0x1a1a33, 1).fillRect(gx, barY, GRID_W, 8);
    g.fillStyle(frac > 0.3 ? NEON.green : NEON.pink, 1).fillRect(gx, barY, GRID_W * frac, 8);
    // Lives, capped so the icons never run into the score.
    for (let i = 0; i < Math.min(this.lives, 5); i++) this.drawHopper(g, 150 + i * 30, 24, 'up', NEON.cyan, 0.55);
  }

  private drawItem(g: Phaser.GameObjects.Graphics, lane: Lane, it: Item, x: number, y: number): void {
    const goingRight = lane.speed > 0;
    switch (lane.item) {
      case 'log': {
        g.fillStyle(NEON.purple, 0.2).fillRoundedRect(x - 2, y + 6, it.w + 4, CELL - 12, 10);
        g.fillStyle(0x2b1650, 1).fillRoundedRect(x, y + 8, it.w, CELL - 16, 9);
        g.lineStyle(2, NEON.purple, 1).strokeRoundedRect(x, y + 8, it.w, CELL - 16, 9);
        for (let i = 1; i < it.w / CELL; i++) g.lineBetween(x + i * CELL, y + 14, x + i * CELL, y + CELL - 14);
        break;
      }
      case 'turtle': {
        const under = this.submerged(it);
        const warn = this.level >= 2 && Math.sin(this.elapsed / 900 + it.phase) > 0.45;
        for (let i = 0; i < it.w / CELL; i++) {
          const cx = x + i * CELL + CELL / 2;
          const cy = y + CELL / 2;
          if (under) {
            g.lineStyle(1, NEON.green, 0.3).strokeCircle(cx, cy, 12);
            continue;
          }
          g.fillStyle(NEON.green, warn ? 0.45 : 0.9).fillCircle(cx, cy, 16);
          g.lineStyle(2, 0x0b2a1c, 1).strokeCircle(cx, cy, 9);
          g.fillStyle(NEON.green, 1).fillCircle(cx + (goingRight ? 17 : -17), cy, 5);
        }
        break;
      }
      default: {
        const color = lane.item === 'truck' ? NEON.orange : lane.item === 'racer' ? NEON.pink : NEON.yellow;
        const top = y + 9;
        const h = CELL - 18;
        g.fillStyle(color, 0.2).fillRoundedRect(x, top - 3, it.w, h + 6, 8);
        g.fillStyle(0x140a1e, 1).fillRoundedRect(x + 3, top, it.w - 6, h, 6);
        g.lineStyle(2, color, 1).strokeRoundedRect(x + 3, top, it.w - 6, h, 6);
        // Headlights point the way it's driving.
        const hx = goingRight ? x + it.w - 8 : x + 8;
        g.fillStyle(0xffffff, 1).fillCircle(hx, top + 6, 3).fillCircle(hx, top + h - 6, 3);
        if (lane.item === 'truck') g.lineBetween(goingRight ? x + it.w - 22 : x + 22, top + 3, goingRight ? x + it.w - 22 : x + 22, top + h - 3);
      }
    }
  }

  /** The hopper: a rounded diamond with eyes looking where it's headed. */
  private drawHopper(g: Phaser.GameObjects.Graphics, x: number, y: number, facing: DirName, color: number, scale: number): void {
    const r = 15 * scale;
    const pts = [
      new Phaser.Math.Vector2(x, y - r),
      new Phaser.Math.Vector2(x + r, y),
      new Phaser.Math.Vector2(x, y + r),
      new Phaser.Math.Vector2(x - r, y),
    ];
    g.fillStyle(color, 0.25).fillCircle(x, y, r + 5);
    g.fillStyle(color, 1).fillPoints(pts, true);
    const [dx, dy] = DIRS[facing];
    const ex = dx * 4 * scale;
    const ey = dy * 4 * scale;
    const px = -dy * 5 * scale;
    const py = dx * 5 * scale;
    g.fillStyle(NEON.bg, 1)
      .fillCircle(x + ex + px, y + ey + py, 2.5 * scale)
      .fillCircle(x + ex - px, y + ey - py, 2.5 * scale);
  }
}
