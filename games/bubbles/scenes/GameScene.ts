import Phaser from 'phaser';
import {
  AIM_LIMIT,
  AIM_SPEED,
  CLUSTER_CHANCE,
  COLLIDE,
  COLS,
  FIELD_W,
  FIELD_X,
  FIELD_Y,
  GAME_ID,
  HEIGHT,
  LAUNCH_X,
  LAUNCH_Y,
  LOSE_ROW,
  MIN_GROUP,
  R,
  ROW_H,
  SHOT_SPEED,
  START_ROWS,
  WIDTH,
} from '../config';
import { BUBBLE_COLORS, BubbleSprite, ensureBubbleTextures } from '../art';
import { type Bubble, bubbles, buildField, cellCenter, crossed, type Grid, isEmpty, placeBubble, pushRow } from '../grid';
import { clearBonus, colorCount, levelFor, pickColor, refreshQueue, shotScore, shotsPerDrop, streakMultiplier } from '../rules';
import { aimAt, clampAim, pathLength, type Point, pointAlong, type ShotPath, simulateShot } from '../shot';
import { getHighScore, trophiesFor } from '../../../shared/achievements';
import { ArcadeControls } from '../../../shared/controls';
import { frameSeconds } from '../../../shared/frame';
import { PauseController } from '../../../shared/pause';
import { dailyOutcome, type DailyRun, dailyRunFrom, type Dice, diceFor } from '../../../shared/rng';
import { endRun, SCENE } from '../../../shared/scenes';
import { noise, tone } from '../../../shared/sfx';
import { bakeTexture, StampLayer } from '../../../shared/stamps';
import { burstEmitter, dailyHudLabel, drawGrid, floatText, HUD_LABEL_STYLE, HUD_STYLE, impact, NEON, reducedMotion, showBanner } from '../../../shared/ui';
import type { TROPHIES } from '../trophies';

const { reach, unlock, addCounter } = trophiesFor<typeof TROPHIES>();

/** The launcher and the next-bubble slot, in screen pixels. */
const LAUNCHER = { x: FIELD_X + LAUNCH_X, y: FIELD_Y + LAUNCH_Y };
const NEXT_SLOT = { x: LAUNCHER.x - 86, y: LAUNCHER.y + 18 };
/** Screen y of the line no bubble may reach: just under the last safe row. */
const LOSE_LINE_Y = FIELD_Y + (LOSE_ROW - 1) * ROW_H + 2 * R + 3;
const LEFT_PANEL_X = FIELD_X / 2;
const RIGHT_PANEL_X = FIELD_X + FIELD_W + FIELD_X / 2;

interface Flight {
  shot: ShotPath;
  color: number;
  sprite: BubbleSprite;
  length: number;
  travelled: number;
  /** Distances along the path of the wall bounces still to come, for their sound. */
  bounces: number[];
}

export class GameScene extends Phaser.Scene {
  /** The daily challenge being played, or null in a normal game. */
  private daily: DailyRun | null = null;
  private dice!: (part: string) => Dice;

  private grid!: Grid;
  private sprites = new Map<string, BubbleSprite>();
  /** Loaded bubble colors: [current, next]. */
  private queue: number[] = [];
  private aim = 0;
  private flight: Flight | null = null;
  /** Between fields: no shooting while the next one comes in. */
  private busy = false;
  private over = false;
  /** True from a pointer press in play until its release, which fires. */
  private pointerAiming = false;

  private score = 0;
  private shots = 0;
  private clears = 0;
  private level = 1;
  private streak = 0;
  private misses = 0;
  private totalPopped = 0;
  /** Bumped on every field change, so the guide is only recomputed when something moved. */
  private fieldVersion = 0;
  private guideKey = '';

  private field!: Phaser.GameObjects.Container;
  /** The aim guide's dots and landing ring, as tinted Images in a Container over the field. */
  private guide!: StampLayer;
  private barrel!: Phaser.GameObjects.Image;
  private loseLine!: Phaser.GameObjects.Graphics;
  private meter!: Phaser.GameObjects.Graphics;
  private loaded?: BubbleSprite;
  private nextUp?: BubbleSprite;
  private burst!: Phaser.GameObjects.Particles.ParticleEmitter;
  private scoreText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private streakText!: Phaser.GameObjects.Text;
  private controls!: ArcadeControls;
  private pause!: PauseController;

  constructor() {
    super(SCENE.game);
  }

  init(data: { daily?: boolean } = {}): void {
    // Daily challenge: fields, new rows and loaded colors are seeded from the date.
    this.daily = dailyRunFrom(data, GAME_ID);
    this.dice = diceFor(this.daily);
    this.sprites = new Map();
    this.queue = [];
    this.aim = 0;
    this.flight = null;
    this.busy = false;
    this.over = false;
    this.pointerAiming = false;
    this.score = 0;
    this.shots = 0;
    this.clears = 0;
    this.level = 1;
    this.streak = 0;
    this.misses = 0;
    this.totalPopped = 0;
    this.fieldVersion = 0;
    this.guideKey = '';
    this.loaded = undefined;
    this.nextUp = undefined;
  }

  create(): void {
    this.cameras.main.fadeIn(250, 5, 5, 13);
    ensureBubbleTextures(this);
    drawGrid(this, WIDTH, HEIGHT);
    this.drawFrame();

    this.field = this.add.container(FIELD_X, FIELD_Y);
    this.guide = new StampLayer(this, 0, this.add.container(FIELD_X, FIELD_Y));
    this.barrel = this.makeBarrel();
    this.burst = burstEmitter(this, 260, 520);

    this.createHud();
    this.controls = new ArcadeControls(this);
    this.pause = new PauseController(this, this.controls, { canPause: () => !this.over });
    this.bindPointer();

    this.newField(false);
    showBanner(this, 'LEVEL 1', NEON.cyan, HEIGHT / 2);
  }

  // ---------------------------------------------------------------- setup

  private drawFrame(): void {
    const g = this.add.graphics();
    g.fillStyle(NEON.purple, 0.05).fillRect(FIELD_X, FIELD_Y, FIELD_W, HEIGHT - FIELD_Y);
    for (const [w, a] of [
      [8, 0.12],
      [3, 0.9],
    ]) {
      g.lineStyle(w, NEON.purple, a);
      g.lineBetween(FIELD_X - 2, FIELD_Y - 4, FIELD_X - 2, HEIGHT);
      g.lineBetween(FIELD_X + FIELD_W + 2, FIELD_Y - 4, FIELD_X + FIELD_W + 2, HEIGHT);
      g.lineBetween(FIELD_X - 2, FIELD_Y - 4, FIELD_X + FIELD_W + 2, FIELD_Y - 4);
    }
    g.fillStyle(NEON.purple, 0.5).fillRect(FIELD_X - 2, FIELD_Y - 14, FIELD_W + 4, 10);

    this.loseLine = this.add.graphics();
    for (let x = FIELD_X; x < FIELD_X + FIELD_W; x += 16) this.loseLine.lineStyle(2, NEON.pink, 1).lineBetween(x, LOSE_LINE_Y, x + 8, LOSE_LINE_Y);
    this.loseLine.setAlpha(0.35);

    // Launcher base and the next-bubble cradle, baked once: a Graphics rebuilds its circles every frame.
    const outer = R + 12;
    const launcher = bakeTexture(this, 'bubbles-launcher', outer * 2, outer * 2, (g) => {
      g.lineStyle(2, NEON.cyan, 0.8).strokeCircle(outer, outer, R + 8);
      g.lineStyle(6, NEON.cyan, 0.12).strokeCircle(outer, outer, R + 8);
    });
    this.add.image(LAUNCHER.x, LAUNCHER.y, launcher);
    const cradle = Math.ceil(R * 0.8 + 8);
    const next = bakeTexture(this, 'bubbles-cradle', cradle * 2, cradle * 2, (g) => {
      g.lineStyle(2, NEON.muted, 0.6).strokeCircle(cradle, cradle, R * 0.8 + 6);
    });
    this.add.image(NEXT_SLOT.x, NEXT_SLOT.y, next);
    this.add.text(NEXT_SLOT.x, NEXT_SLOT.y + R + 10, 'NEXT', HUD_LABEL_STYLE).setOrigin(0.5);
  }

  private makeBarrel(): Phaser.GameObjects.Image {
    // Drawn pointing straight up; rotation follows the aim.
    const key = bakeTexture(this, 'bubbles-barrel', 18, 28, (g) => {
      g.fillStyle(NEON.cyan, 0.15).fillRoundedRect(1, 1, 16, 26, 4);
      g.lineStyle(2, NEON.cyan, 1).strokeRoundedRect(1, 1, 16, 26, 4);
    });
    // The barrel turns about the launcher's centre, which is this point of the texture.
    return this.add.image(LAUNCHER.x, LAUNCHER.y, key).setDisplayOrigin(9, R + 35);
  }

  private createHud(): void {
    const label = (x: number, y: number, text: string) => this.add.text(x, y, text, HUD_LABEL_STYLE).setOrigin(0.5);
    const value = (x: number, y: number, text: string, color?: string) =>
      this.add.text(x, y, text, color ? { ...HUD_STYLE, color } : HUD_STYLE).setOrigin(0.5);

    label(LEFT_PANEL_X, 80, 'SCORE');
    this.scoreText = value(LEFT_PANEL_X, 102, '0');
    label(LEFT_PANEL_X, 150, 'BEST');
    value(LEFT_PANEL_X, 172, getHighScore(GAME_ID).toLocaleString(), '#ffe45e').setFontSize(12);
    if (this.daily) dailyHudLabel(this, LEFT_PANEL_X, 220, GAME_ID, this.daily, { align: 'center', narrow: true });

    label(RIGHT_PANEL_X, 80, 'LEVEL');
    this.levelText = value(RIGHT_PANEL_X, 102, '1');
    label(RIGHT_PANEL_X, 150, 'CEILING');
    this.meter = this.add.graphics();
    label(RIGHT_PANEL_X, 220, 'STREAK');
    this.streakText = value(RIGHT_PANEL_X, 242, '');
  }

  private bindPointer(): void {
    // Mouse and touch: move or drag to aim, release to fire. A press on the NEXT bubble swaps instead.
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.pause.isPaused || this.over) return;
      if (this.pointerAiming || (!p.wasTouch && p.y < LAUNCHER.y)) this.aimAtPointer(p);
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.pause.isPaused || this.over) return;
      if (Phaser.Math.Distance.Between(p.x, p.y, NEXT_SLOT.x, NEXT_SLOT.y) < R + 12) {
        this.swap();
        return;
      }
      this.pointerAiming = true;
      this.aimAtPointer(p);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (!this.pointerAiming) return;
      this.pointerAiming = false;
      if (this.pause.isPaused || this.over) return;
      this.aimAtPointer(p);
      this.fire();
    });
  }

  private aimAtPointer(p: Phaser.Input.Pointer): void {
    this.aim = aimAt(LAUNCHER, { x: p.x, y: p.y }, AIM_LIMIT);
  }

  // ---------------------------------------------------------------- loop

  update(_time: number, deltaMs: number): void {
    if (this.pause.isPaused) return;
    const dt = frameSeconds(deltaMs);

    if (!this.over) {
      const turn = this.controls.axisX;
      if (turn !== 0) this.aim = clampAim(this.aim + turn * AIM_SPEED * dt, AIM_LIMIT);
      if (this.controls.justPressed('action')) this.fire();
      if (this.controls.justPressed('alt')) this.swap();
    }

    if (this.flight) this.fly(dt);
    this.barrel.setRotation(this.aim);
    this.drawGuide();
  }

  private fly(dt: number): void {
    const f = this.flight!;
    f.travelled += SHOT_SPEED * dt;
    while (f.bounces.length && f.travelled >= f.bounces[0]) {
      f.bounces.shift();
      tone({ freq: 380, duration: 0.04, volume: 0.04 });
    }
    const p = pointAlong(f.shot.path, f.travelled);
    f.sprite.setPosition(FIELD_X + p.x, FIELD_Y + p.y);
    if (f.travelled >= f.length) this.land();
  }

  /** Dotted guide to the first wall bounce and a little past it, plus a ghost where the shot would settle. */
  private drawGuide(): void {
    const hidden = !!this.flight || this.busy || this.over;
    const key = hidden ? 'hidden' : `${this.aim.toFixed(4)}|${this.queue[0]}|${this.fieldVersion}`;
    if (key === this.guideKey) return;
    this.guideKey = key;
    this.guide.begin();
    if (!hidden) this.stampGuide();
    this.guide.end();
  }

  private stampGuide(): void {
    const shot = simulateShot(this.grid, { x: LAUNCH_X, y: LAUNCH_Y }, this.aim, { r: R, collide: COLLIDE, maxBounces: 1 });
    const color = BUBBLE_COLORS[this.queue[0]];
    const length = pathLength(shot.path);
    // White shapes baked once, tinted to the next bubble's color.
    const dot = bakeTexture(this, 'bubbles-guide-dot', 6, 6, (g) => g.fillStyle(0xffffff, 1).fillCircle(3, 3, 2.5));
    for (let d = R + 10; d < length; d += 14) {
      const p = pointAlong(shot.path, d);
      this.guide.stamp(dot, p.x - 3, p.y - 3, 0.9 - 0.6 * (d / length), color);
    }
    if (shot.landing) {
      const c = cellCenter(this.grid, shot.landing.row, shot.landing.col, R);
      const ring = bakeTexture(this, 'bubbles-guide-ring', R * 2, R * 2, (g) => g.lineStyle(2, 0xffffff, 0.45).strokeCircle(R, R, R - 2));
      this.guide.stamp(ring, c.x - R, c.y - R, 1, color);
    }
  }

  // ---------------------------------------------------------------- shooting

  private fire(): void {
    if (this.flight || this.busy || this.over || this.pause.isPaused || !this.loaded) return;
    const shot = simulateShot(this.grid, { x: LAUNCH_X, y: LAUNCH_Y }, this.aim, { r: R, collide: COLLIDE });
    if (!shot.landing) return;

    const bounces: number[] = [];
    for (let i = 1; i < shot.path.length - 1; i++) bounces.push(pathLength(shot.path.slice(0, i + 1)));
    // The loaded bubble flies; stop it sliding in from the NEXT slot if it still was.
    this.tweens.killTweensOf(this.loaded.parts);
    this.loaded.setScale(1);
    this.flight = { shot, color: this.queue[0], sprite: this.loaded, length: pathLength(shot.path), travelled: 0, bounces };
    this.loaded = undefined;
    tone({ freq: 520, toFreq: 880, duration: 0.08, type: 'triangle', volume: 0.07 });

    this.queue = [this.queue[1], pickColor(this.grid, colorCount(this.level), this.dice('queue').next)];
    this.showQueue(true);
  }

  private swap(): void {
    if (this.flight || this.busy || this.over || this.pause.isPaused || this.queue.length < 2) return;
    this.queue = [this.queue[1], this.queue[0]];
    this.showQueue(true);
    tone({ freq: 660, toFreq: 440, duration: 0.06, type: 'triangle', volume: 0.05 });
  }

  /** Redraws the loaded and next bubbles. `slide` animates the next one moving up into the launcher. */
  private showQueue(slide: boolean): void {
    this.loaded?.destroy();
    this.nextUp?.destroy();
    this.loaded = new BubbleSprite(this, LAUNCHER.x, LAUNCHER.y, this.queue[0]).setDepth(5);
    this.nextUp = new BubbleSprite(this, NEXT_SLOT.x, NEXT_SLOT.y, this.queue[1]).setScale(0.8).setDepth(5);
    if (slide && !reducedMotion()) {
      this.loaded.setPosition(NEXT_SLOT.x, NEXT_SLOT.y).setScale(0.8);
      this.tweens.add({ targets: this.loaded.parts, x: LAUNCHER.x, y: LAUNCHER.y, scale: 1, duration: 120, ease: 'Quad.easeOut' });
      this.nextUp.setScale(0);
      this.tweens.add({ targets: this.nextUp.parts, scale: 0.8, duration: 160, ease: 'Back.easeOut' });
    }
  }

  private land(): void {
    const f = this.flight!;
    this.flight = null;
    f.sprite.destroy();
    const { row, col } = f.shot.landing!;
    const at = this.toScreen(row, col);

    const out = placeBubble(this.grid, row, col, f.color, MIN_GROUP);
    this.shots++;
    this.fieldVersion++;

    if (out.popped.length) {
      this.streak++;
      this.misses = 0;
      const points = shotScore(out.popped.length, out.dropped.length, this.streak);
      this.score += points;
      this.totalPopped += out.popped.length + out.dropped.length;
      addCounter('bubbles.popped', out.popped.length + out.dropped.length);
      reach('bubbles.drop', out.dropped.length);
      this.popBubbles(out.popped);
      this.dropBubbles(out.dropped);
      const mult = streakMultiplier(this.streak);
      floatText(this, at.x, at.y - 10, mult > 1 ? `+${points} x${mult}` : `+${points}`, BUBBLE_COLORS[f.color], 14);
      if (out.dropped.length >= 6) showBanner(this, `${out.dropped.length} DROPPED`, NEON.yellow, HEIGHT / 2 + 80);
    } else {
      this.streak = 0;
      this.misses++;
      tone({ freq: 200, duration: 0.06, type: 'triangle', volume: 0.06 });
    }
    this.syncSprites();

    if (crossed(this.grid, LOSE_ROW)) {
      this.gameOver();
      return;
    }

    const before = this.level;
    this.level = levelFor(this.shots, this.clears);
    if (isEmpty(this.grid)) {
      this.fieldCleared();
      return;
    }
    if (this.level > before) this.announceLevel(before);
    if (this.misses >= shotsPerDrop(this.level)) {
      this.misses = 0;
      this.dropCeiling();
      if (this.over) return;
    }
    this.queue = refreshQueue(this.grid, this.queue, colorCount(this.level), this.dice('queue').next);
    this.showQueue(false);
    this.updateHud();
  }

  private popBubbles(popped: Bubble[]): void {
    popped.forEach((b, i) => {
      const sprite = this.takeSprite(b);
      const at = this.toScreen(b.row, b.col);
      const color = BUBBLE_COLORS[b.color];
      this.time.delayedCall(i * 35, () => {
        this.burst.setParticleTint(color);
        this.burst.explode(10, at.x, at.y);
        if (i < 10) tone({ freq: 600 + i * 70, duration: 0.06, volume: 0.05 });
      });
      this.tweens.add({
        targets: sprite.parts,
        scale: 1.5,
        alpha: 0,
        duration: 160,
        delay: i * 35,
        onComplete: () => sprite.destroy(),
      });
    });
  }

  private dropBubbles(dropped: Bubble[]): void {
    if (!dropped.length) return;
    let cx = 0;
    let cy = 0;
    dropped.forEach((b, i) => {
      const sprite = this.takeSprite(b);
      const at = this.toScreen(b.row, b.col);
      cx += at.x / dropped.length;
      cy += at.y / dropped.length;
      // Out of the field container, so a ceiling push mid-fall does not drag it along.
      this.field.remove(sprite.parts);
      sprite.setPosition(at.x, at.y).setDepth(4);
      this.tweens.add({
        targets: sprite.parts,
        y: HEIGHT + 2 * R,
        x: at.x + Phaser.Math.Between(-40, 40),
        alpha: 0.4,
        duration: 650 + (HEIGHT - at.y) * 0.6,
        delay: 80 + (i % 6) * 25,
        ease: 'Quad.easeIn',
        onComplete: () => sprite.destroy(),
      });
    });
    floatText(this, cx, cy, `DROP x${dropped.length}`, NEON.yellow, 12);
    this.time.delayedCall(450, () => tone({ freq: 880, toFreq: 1320, duration: 0.18, type: 'triangle', volume: 0.08 }));
  }

  private dropCeiling(): void {
    const colors = colorCount(this.level);
    const dice = this.dice('rows');
    pushRow(this.grid, () => dice.between(0, colors - 1));
    this.fieldVersion++;
    this.clearSprites();
    this.syncSprites();
    if (!reducedMotion()) {
      this.field.y = FIELD_Y - ROW_H;
      this.tweens.add({ targets: this.field, y: FIELD_Y, duration: 260, ease: 'Cubic.easeOut' });
    }
    impact(this, this.controls, 140, 0.005);
    noise(0.15, 0.06);
    tone({ freq: 140, toFreq: 90, duration: 0.2, type: 'sawtooth', volume: 0.06 });
    if (crossed(this.grid, LOSE_ROW)) this.gameOver();
  }

  private fieldCleared(): void {
    this.busy = true;
    this.clears++;
    const bonus = clearBonus(this.level);
    this.level = levelFor(this.shots, this.clears);
    this.score += bonus;
    this.misses = 0;
    unlock('bubbles.clear');
    this.updateHud();
    [523, 659, 784, 1047].forEach((freq, i) => this.time.delayedCall(i * 110, () => tone({ freq, duration: 0.18, type: 'triangle', volume: 0.1 })));
    showBanner(this, `FIELD CLEAR\n+${bonus.toLocaleString()}`, NEON.green, HEIGHT / 2);
    this.time.delayedCall(1500, () => {
      if (this.over) return;
      this.newField(true);
      showBanner(this, `LEVEL ${this.level}`, NEON.cyan, HEIGHT / 2);
    });
  }

  /** Builds a fresh field for the current level and loads two bubbles for it. */
  private newField(popIn: boolean): void {
    const colors = colorCount(this.level);
    this.grid = buildField(COLS, LOSE_ROW + 1, START_ROWS, colors, CLUSTER_CHANCE, this.dice('field').next);
    this.fieldVersion++;
    this.clearSprites();
    this.syncSprites();
    if (popIn && !reducedMotion()) {
      for (const [key, sprite] of this.sprites) {
        const row = Number(key.split(',')[0]);
        sprite.setScale(0);
        this.tweens.add({ targets: sprite.parts, scale: 1, duration: 260, delay: row * 60, ease: 'Back.easeOut' });
      }
    }
    const queueDice = this.dice('queue');
    this.queue = [pickColor(this.grid, colors, queueDice.next), pickColor(this.grid, colors, queueDice.next)];
    this.showQueue(false);
    this.busy = false;
    this.updateHud();
  }

  private announceLevel(previous: number): void {
    const moreColors = colorCount(this.level) > colorCount(previous);
    showBanner(this, moreColors ? `LEVEL ${this.level}\nNEW COLOR` : `LEVEL ${this.level}`, NEON.cyan, HEIGHT / 2);
    tone({ freq: 660, toFreq: 990, duration: 0.2, type: 'triangle', volume: 0.08 });
  }

  private gameOver(): void {
    this.over = true;
    this.pointerAiming = false;
    this.updateHud();
    impact(this, this.controls, 320, 0.012);
    if (!reducedMotion()) this.cameras.main.flash(200, 255, 46, 151);
    noise(0.4, 0.12);
    tone({ freq: 300, toFreq: 60, duration: 0.6, type: 'sawtooth', volume: 0.08 });
    // Dim the field from the bottom up.
    const list = [...this.sprites.entries()].sort((a, b) => Number(b[0].split(',')[0]) - Number(a[0].split(',')[0]));
    list.forEach(([, sprite], i) => this.time.delayedCall(i * 8, () => sprite.body.setTint(NEON.muted)));
    endRun(this, { gameId: GAME_ID, score: this.score, detail: `LEVEL ${this.level}   ${this.totalPopped} POPPED`, ...dailyOutcome(this.daily) }, 1400);
  }

  // ---------------------------------------------------------------- sprites and hud

  private toScreen(row: number, col: number): Point {
    const c = cellCenter(this.grid, row, col, R);
    return { x: FIELD_X + c.x, y: this.field.y + c.y };
  }

  /** The sprite of a bubble leaving the field, so it can play out its exit. */
  private takeSprite(b: Bubble): BubbleSprite {
    const key = `${b.row},${b.col}`;
    const sprite = this.sprites.get(key);
    this.sprites.delete(key);
    if (sprite) return sprite;
    // The bubble that just landed pops before it ever had a sprite.
    const c = cellCenter(this.grid, b.row, b.col, R);
    return new BubbleSprite(this, c.x, c.y, b.color, this.field);
  }

  private clearSprites(): void {
    for (const sprite of this.sprites.values()) sprite.destroy();
    this.sprites.clear();
  }

  /** Matches the sprites to the grid: adds missing bubbles and removes ones that are gone. */
  private syncSprites(): void {
    const seen = new Set<string>();
    for (const b of bubbles(this.grid)) {
      const key = `${b.row},${b.col}`;
      seen.add(key);
      const existing = this.sprites.get(key);
      if (existing?.color === b.color) continue;
      existing?.destroy();
      const c = cellCenter(this.grid, b.row, b.col, R);
      this.sprites.set(key, new BubbleSprite(this, c.x, c.y, b.color, this.field));
    }
    for (const [key, sprite] of this.sprites) {
      if (seen.has(key)) continue;
      sprite.destroy();
      this.sprites.delete(key);
    }
  }

  private updateHud(): void {
    reach('bubbles.score', this.score);
    this.scoreText.setText(this.score.toLocaleString());
    this.levelText.setText(String(this.level));
    this.streakText.setText(this.streak > 1 ? `x${streakMultiplier(this.streak)}` : '-');

    // Ceiling meter: one dot per miss allowed before the next push, lit as they are used up.
    const total = shotsPerDrop(this.level);
    const g = this.meter.clear();
    const gap = 16;
    const x0 = RIGHT_PANEL_X - ((total - 1) * gap) / 2;
    for (let i = 0; i < total; i++) {
      const used = i < this.misses;
      g.fillStyle(used ? NEON.pink : NEON.muted, used ? 1 : 0.35).fillCircle(x0 + i * gap, 174, 5);
    }

    const danger = !this.over && crossed(this.grid, LOSE_ROW - 2);
    this.tweens.killTweensOf(this.loseLine);
    this.loseLine.setAlpha(0.35);
    if (danger) this.tweens.add({ targets: this.loseLine, alpha: 1, duration: 300, yoyo: true, repeat: -1 });
  }
}
