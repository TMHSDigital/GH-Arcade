import Phaser from 'phaser';
import type { ArcadeControls } from './controls';
import { tone } from './sfx';
import { NEON, neonText } from './ui';

export interface MenuItem {
  label: string;
  onSelect: () => void;
}

export interface OptionMenuOptions {
  x: number;
  y: number;
  items: MenuItem[];
  /** 'row' lays options out left to right; 'column' stacks them. */
  layout?: 'row' | 'column';
  spacing?: number;
  size?: number;
  depth?: number;
  /** Start disabled (e.g. a pause menu that only works while paused). */
  enabled?: boolean;
}

/**
 * A list of neon options that works with every input: arrows, d-pad or stick to move, Space, Enter
 * or A to choose, or hover and click / tap an option directly. The selected option is highlighted
 * with a marker, so it's clear what the action button will do.
 */
export class OptionMenu {
  private selected = 0;
  private enabled: boolean;
  private readonly texts: Phaser.GameObjects.Text[];
  private readonly marker: Phaser.GameObjects.Text;
  private readonly layout: 'row' | 'column';

  constructor(
    scene: Phaser.Scene,
    private readonly controls: ArcadeControls<string>,
    private readonly opts: OptionMenuOptions,
  ) {
    this.layout = opts.layout ?? 'row';
    this.enabled = opts.enabled ?? true;
    const size = opts.size ?? 16;
    const spacing = opts.spacing ?? (this.layout === 'row' ? 280 : 46);
    const n = opts.items.length;
    this.texts = opts.items.map((item, i) => {
      const offset = (i - (n - 1) / 2) * spacing;
      const x = this.layout === 'row' ? opts.x + offset : opts.x;
      const y = this.layout === 'row' ? opts.y : opts.y + offset;
      const t = neonText(scene, x, y, item.label, size, NEON.white).setDepth(opts.depth ?? 0);
      t.setInteractive({ useHandCursor: true });
      t.on('pointerover', () => {
        if (!this.enabled) return;
        this.selected = i;
        this.paint();
      });
      t.on('pointerdown', () => this.choose(i));
      return t;
    });
    this.marker = neonText(scene, 0, 0, '>', size, NEON.yellow).setDepth(opts.depth ?? 0);
    this.paint();
    this.setEnabled(this.enabled);

    const onUpdate = () => {
      if (!this.enabled) return;
      const prev = this.layout === 'row' ? 'left' : 'up';
      const next = this.layout === 'row' ? 'right' : 'down';
      if (this.controls.justPressed(prev)) this.move(-1);
      if (this.controls.justPressed(next)) this.move(1);
      if (this.controls.justPressed('action')) this.choose(this.selected);
    };
    scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate));
  }

  /** Every game object the menu draws, e.g. to put them in a container. */
  get objects(): Phaser.GameObjects.GameObject[] {
    return [...this.texts, this.marker];
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    for (const t of this.texts) {
      if (on) t.setInteractive({ useHandCursor: true });
      else t.disableInteractive();
    }
    if (on) {
      this.selected = 0;
      this.paint();
    }
  }

  private move(dir: number): void {
    const n = this.texts.length;
    this.selected = (this.selected + dir + n) % n;
    this.paint();
    tone({ freq: 660, duration: 0.03, type: 'square', volume: 0.03 });
  }

  private choose(i: number): void {
    if (!this.enabled) return;
    this.selected = i;
    this.paint();
    tone({ freq: 880, toFreq: 1320, duration: 0.08, type: 'triangle', volume: 0.05 });
    this.opts.items[i].onSelect();
  }

  private paint(): void {
    this.texts.forEach((t, i) => t.setColor(i === this.selected ? '#ffe45e' : '#e8e8ff').setAlpha(i === this.selected ? 1 : 0.6));
    const t = this.texts[this.selected];
    this.marker.setPosition(t.x - t.width / 2 - 24, t.y);
  }
}
