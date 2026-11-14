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
  /** The option highlighted when the menu opens (the first one by default). */
  selected?: number;
}

/**
 * A list of neon options that works with every input: arrows, d-pad or stick to move, Space, Enter
 * or A to choose, or hover and click / tap an option directly. The selected option is highlighted
 * with a marker, so it's clear what the action button will do. Pass several controls (one per
 * player) to let every player in a local multiplayer game drive the menu.
 */
export class OptionMenu {
  private selected = 0;
  private enabled: boolean;
  /** Frame in which the menu was enabled; input is ignored until the next one. */
  private armedFrame = -1;
  private readonly texts: Phaser.GameObjects.Text[];
  private readonly marker: Phaser.GameObjects.Text;
  private readonly layout: 'row' | 'column';
  private readonly controls: ArcadeControls<string>[];

  constructor(
    private readonly scene: Phaser.Scene,
    controls: ArcadeControls<string> | ArcadeControls<string>[],
    private readonly opts: OptionMenuOptions,
  ) {
    this.controls = Array.isArray(controls) ? controls : [controls];
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
      // The press that opened this menu (pause, or an option in another menu) is still "just pressed"
      // during the frame it was enabled in, and must not also pick an option here.
      if (!this.enabled || scene.game.loop.frame === this.armedFrame) return;
      const prev = this.layout === 'row' ? 'left' : 'up';
      const next = this.layout === 'row' ? 'right' : 'down';
      const pressed = (name: string) => this.controls.some((c) => c.justPressed(name));
      if (pressed(prev)) this.move(-1);
      if (pressed(next)) this.move(1);
      if (pressed('action')) this.choose(this.selected);
    };
    scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate));
  }

  /** Every game object the menu draws, e.g. to put them in a container. */
  get objects(): Phaser.GameObjects.GameObject[] {
    return [...this.texts, this.marker];
  }

  /** Changes an option's text, e.g. to show the current value of a setting. */
  setLabel(index: number, label: string): void {
    this.texts[index].setText(label);
    this.paint();
  }

  setVisible(on: boolean): void {
    for (const o of [...this.texts, this.marker]) o.setVisible(on);
  }

  setEnabled(on: boolean): void {
    if (on && !this.enabled) this.armedFrame = this.scene.game.loop.frame;
    this.enabled = on;
    for (const t of this.texts) {
      if (on) t.setInteractive({ useHandCursor: true });
      else t.disableInteractive();
    }
    if (on) {
      const first = this.opts.selected ?? 0;
      this.selected = first >= 0 && first < this.texts.length ? first : 0;
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
