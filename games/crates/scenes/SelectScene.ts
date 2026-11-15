import Phaser from 'phaser';
import { HEIGHT, WIDTH } from '../config';
import { LEVELS } from '../levels';
import { firstUnsolved, loadProgress, parCount, solvedCount, totalScore } from '../progress';
import { ArcadeControls } from '../../../shared/controls';
import { SCENE } from '../../../shared/scenes';
import { tone } from '../../../shared/sfx';
import { keyLabel } from '../../../shared/settings';
import { isTouchDevice } from '../../../shared/touch';
import { drawGrid, fadeToScene, hex, HUD_LABEL_STYLE, NEON, neonText, PIXEL_FONT } from '../../../shared/ui';

export const SELECT_SCENE = 'Select';

const COLS = 5;
const TILE_W = 128;
const TILE_H = 104;
const GAP = 16;
const TOP = 130;

/**
 * Level select: a grid of every level, solved ones lit green with their best moves. Every level is
 * open, and the first unsolved one is picked to begin with. Arrows, d-pad or stick to choose, the
 * action button, a click or a tap to play, Pause to go back to the menu.
 */
export class SelectScene extends Phaser.Scene {
  private selected = 0;
  private gfx!: Phaser.GameObjects.Graphics;
  private controls!: ArcadeControls;
  private solved: boolean[] = [];
  private leaving = false;
  private readyAt = 0;

  constructor() {
    super(SELECT_SCENE);
  }

  init(data: { level?: number }): void {
    const progress = loadProgress();
    this.solved = LEVELS.map((l) => progress[l.name] !== undefined);
    this.selected = typeof data.level === 'number' && LEVELS[data.level] ? data.level : firstUnsolved(progress);
    this.leaving = false;
  }

  create(): void {
    this.cameras.main.fadeIn(250, 5, 5, 13);
    drawGrid(this, WIDTH, HEIGHT);
    const progress = loadProgress();
    neonText(this, WIDTH / 2, 60, 'SELECT LEVEL', 24, NEON.orange);
    const summary = `SOLVED ${solvedCount(progress)} / ${LEVELS.length}    AT PAR ${parCount(progress)}    SCORE ${totalScore(progress).toLocaleString()}`;
    this.add.text(WIDTH / 2, 96, summary, HUD_LABEL_STYLE).setOrigin(0.5);
    this.gfx = this.add.graphics();

    LEVELS.forEach((def, i) => {
      const { x, y } = this.tileCenter(i);
      const color = this.solved[i] ? NEON.green : NEON.white;
      this.add.text(x, y - 22, String(i + 1), { fontFamily: PIXEL_FONT, fontSize: '20px', color: hex(color) }).setOrigin(0.5);
      this.add.text(x, y + 8, def.name.toUpperCase(), { ...HUD_LABEL_STYLE, fontSize: '8px', color: '#e8e8ff' }).setOrigin(0.5);
      const best = progress[def.name];
      const line = best === undefined ? `PAR ${def.par}` : `BEST ${best} / ${def.par}`;
      this.add.text(x, y + 28, line, { ...HUD_LABEL_STYLE, fontSize: '8px', color: best !== undefined && best <= def.par ? hex(NEON.yellow) : HUD_LABEL_STYLE.color }).setOrigin(0.5);
      const zone = this.add.zone(x, y, TILE_W, TILE_H).setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => this.select(i, false));
      zone.on('pointerdown', () => this.play(i));
    });

    const back = isTouchDevice() ? 'TAP HERE FOR THE MENU' : `${keyLabel('pause')}: MENU`;
    const hint = isTouchDevice() ? 'TAP A LEVEL TO PLAY' : `ARROWS TO CHOOSE    ${keyLabel('action', true)} TO PLAY`;
    this.add.text(WIDTH / 2, HEIGHT - 70, hint, HUD_LABEL_STYLE).setOrigin(0.5);
    const backText = this.add.text(WIDTH / 2, HEIGHT - 44, back, { ...HUD_LABEL_STYLE, color: hex(NEON.cyan) }).setOrigin(0.5);
    backText.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.leave());

    this.controls = new ArcadeControls(this);
    this.readyAt = this.time.now + 300;
    this.paint();
  }

  update(): void {
    // A gamepad button still held from the menu would otherwise count as a fresh press.
    if (this.leaving || this.time.now < this.readyAt) return;
    const c = this.controls;
    if (c.justPressed('left')) this.select(this.selected - 1);
    if (c.justPressed('right')) this.select(this.selected + 1);
    if (c.justPressed('up')) this.select(this.selected - COLS);
    if (c.justPressed('down')) this.select(this.selected + COLS);
    if (c.justPressed('action')) this.play(this.selected);
    else if (c.justPressed('pause')) this.leave();
  }

  private tileCenter(i: number): { x: number; y: number } {
    const rows = Math.ceil(LEVELS.length / COLS);
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const gridW = COLS * TILE_W + (COLS - 1) * GAP;
    const gridH = rows * TILE_H + (rows - 1) * GAP;
    const left = (WIDTH - gridW) / 2;
    const top = TOP + Math.max(0, (380 - gridH) / 2);
    return { x: left + col * (TILE_W + GAP) + TILE_W / 2, y: top + row * (TILE_H + GAP) + TILE_H / 2 };
  }

  private select(i: number, sound = true): void {
    if (i < 0 || i >= LEVELS.length || i === this.selected) return;
    this.selected = i;
    if (sound) tone({ freq: 660, duration: 0.03, type: 'square', volume: 0.03 });
    this.paint();
  }

  private paint(): void {
    const g = this.gfx.clear();
    LEVELS.forEach((_def, i) => {
      const { x, y } = this.tileCenter(i);
      const on = i === this.selected;
      const color = on ? NEON.yellow : this.solved[i] ? NEON.green : NEON.purple;
      const left = x - TILE_W / 2;
      const top = y - TILE_H / 2;
      g.fillStyle(color, on ? 0.14 : 0.06).fillRoundedRect(left, top, TILE_W, TILE_H, 10);
      if (on) g.lineStyle(8, color, 0.2).strokeRoundedRect(left, top, TILE_W, TILE_H, 10);
      g.lineStyle(2, color, on ? 1 : 0.6).strokeRoundedRect(left, top, TILE_W, TILE_H, 10);
      if (this.solved[i]) {
        // A small tick in the corner of a solved level.
        const cx = left + TILE_W - 22;
        const cy = top + 16;
        g.lineStyle(3, NEON.green, 1).beginPath();
        g.moveTo(cx - 6, cy).lineTo(cx - 1, cy + 5).lineTo(cx + 8, cy - 5).strokePath();
      }
    });
  }

  private play(i: number): void {
    if (this.leaving) return;
    this.leaving = true;
    this.selected = i;
    this.paint();
    tone({ freq: 880, toFreq: 1320, duration: 0.08, type: 'triangle', volume: 0.05 });
    fadeToScene(this, SCENE.game, { level: i });
  }

  private leave(): void {
    if (this.leaving) return;
    this.leaving = true;
    fadeToScene(this, SCENE.menu);
  }
}
