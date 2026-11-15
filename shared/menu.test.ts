import { describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import type { ArcadeControls } from './controls';
import { OptionMenu, type OptionMenuOptions } from './menu';
import { FakeEmitter, FakeGameObject } from './test-utils';

vi.mock('phaser', async () => (await import('./test-utils')).phaserMock());
vi.mock('./sfx', () => ({ tone: () => undefined }));
// Options and the marker are drawn with neonText; a fake object stands in for each.
vi.mock('./ui', async () => {
  const { FakeGameObject: Fake } = await import('./test-utils');
  return { NEON: {}, neonText: (_scene: unknown, x: number, y: number, text: string) => Object.assign(new Fake(x, y), { text, width: text.length * 16 }) };
});

/** A menu of three options on a fake scene, with keys to press and frames to run. */
function setup(opts: Partial<OptionMenuOptions> = {}) {
  const events = new FakeEmitter();
  const loop = { frame: 1 };
  const scene = { events, game: { loop } } as unknown as Phaser.Scene;
  const pressed = new Set<string>();
  const controls = { justPressed: (name: string) => pressed.has(name) } as unknown as ArcadeControls<string>;
  const chosen: string[] = [];
  const menu = new OptionMenu(scene, controls, {
    x: 400,
    y: 300,
    items: ['ONE', 'TWO', 'THREE'].map((label) => ({ label, onSelect: () => chosen.push(label) })),
    ...opts,
  });
  const [one, two, three, marker] = menu.objects as unknown as FakeGameObject[];
  /** Runs one scene update with these actions just pressed. */
  const frame = (...names: string[]) => {
    loop.frame++;
    pressed.clear();
    names.forEach((n) => pressed.add(n));
    events.emit('update');
    pressed.clear();
  };
  /** The label of the highlighted option: the one painted at full strength. */
  const selected = () => [one, two, three].find((t) => t.alpha === 1)?.text;
  return { menu, chosen, frame, selected, events, texts: [one, two, three], marker, loop, pressed };
}

describe('OptionMenu', () => {
  it('lays a row out left to right around its position, and a column top to bottom', () => {
    const row = setup({ spacing: 100 });
    expect(row.texts.map((t) => [t.x, t.y])).toEqual([
      [300, 300],
      [400, 300],
      [500, 300],
    ]);
    const column = setup({ layout: 'column', spacing: 40 });
    expect(column.texts.map((t) => [t.x, t.y])).toEqual([
      [400, 260],
      [400, 300],
      [400, 340],
    ]);
  });

  it('moves with left and right, wrapping at both ends', () => {
    const { frame, selected } = setup();
    expect(selected()).toBe('ONE');
    frame('left');
    expect(selected()).toBe('THREE');
    frame('right');
    expect(selected()).toBe('ONE');
    frame('right');
    expect(selected()).toBe('TWO');
  });

  it('moves with up and down in a column', () => {
    const { frame, selected } = setup({ layout: 'column' });
    frame('right');
    expect(selected()).toBe('ONE');
    frame('down');
    expect(selected()).toBe('TWO');
    frame('up', 'up');
    expect(selected()).toBe('ONE');
  });

  it('chooses the highlighted option with the action button', () => {
    const { frame, chosen } = setup();
    frame('right');
    frame('action');
    expect(chosen).toEqual(['TWO']);
  });

  it('ignores the press that enabled it until the next frame', () => {
    const { menu, frame, chosen, events, pressed, loop } = setup({ enabled: false });
    frame('action');
    expect(chosen).toEqual([]);
    // The same press that opens the menu is still "just pressed" during this frame.
    loop.frame++;
    menu.setEnabled(true);
    pressed.add('action');
    events.emit('update');
    expect(chosen).toEqual([]);
    frame('action');
    expect(chosen).toEqual(['ONE']);
  });

  it('starts on the option it is given, and again each time it is enabled', () => {
    const { menu, frame, selected } = setup({ selected: 1 });
    expect(selected()).toBe('TWO');
    frame('right');
    expect(selected()).toBe('THREE');
    menu.setEnabled(false);
    menu.setEnabled(true);
    expect(selected()).toBe('TWO');
  });

  it('falls back to the first option when the one it is given does not exist', () => {
    expect(setup({ selected: 7 }).selected()).toBe('ONE');
    expect(setup({ selected: -1 }).selected()).toBe('ONE');
  });

  it('takes clicks and hovers only while enabled', () => {
    const { menu, texts, chosen, selected } = setup();
    texts[2].emit('pointerover');
    expect(selected()).toBe('THREE');
    texts[1].emit('pointerdown');
    expect(chosen).toEqual(['TWO']);

    menu.setEnabled(false);
    expect(texts.every((t) => !t.interactive)).toBe(true);
    texts[0].emit('pointerdown');
    texts[0].emit('pointerover');
    expect(chosen).toEqual(['TWO']);
    expect(selected()).toBe('TWO');
  });

  it('keeps the marker beside the highlighted option, including after a label change', () => {
    const { menu, frame, texts, marker } = setup({ spacing: 200 });
    expect(marker.x).toBe(texts[0].x - texts[0].width / 2 - 24);
    frame('right');
    expect(marker.x).toBe(texts[1].x - texts[1].width / 2 - 24);
    menu.setLabel(1, 'VOLUME  80%');
    expect(texts[1].text).toBe('VOLUME  80%');
    menu.setVisible(false);
    expect([...texts, marker].every((o) => !o.visible)).toBe(true);
  });

  it('stops listening when the scene shuts down', () => {
    const { frame, chosen, events } = setup();
    events.emit('shutdown');
    frame('action');
    expect(chosen).toEqual([]);
  });
});
