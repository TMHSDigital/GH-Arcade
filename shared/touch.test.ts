import { afterEach, describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import type { TouchSettings } from './settings';
import { FakeEmitter, FakeGameObject, installMemoryStorage, installWindow } from './test-utils';

vi.mock('phaser', async () => (await import('./test-utils')).phaserMock());

afterEach(() => vi.unstubAllGlobals());

const WIDTH = 800;

/** Loads touch.ts with the given touch settings, and a scene that can send pointer events. */
async function setup(touch: Partial<TouchSettings> = {}) {
  installMemoryStorage();
  installWindow();
  vi.resetModules();
  const settings = await import('./settings');
  settings.updateSettings({ touch: { ...settings.getSettings().touch, ...touch } });
  const { default: PhaserStub } = (await import('phaser')) as unknown as { default: { Geom: { Rectangle: new (x: number, y: number, w: number, h: number) => Phaser.Geom.Rectangle } } };
  const touchModule = await import('./touch');
  const input = new FakeEmitter();
  const scene = {
    input,
    scale: { gameSize: { width: WIDTH } },
    add: {
      circle: (x: number, y: number, radius: number) => Object.assign(new FakeGameObject(x, y), { radius }),
      text: (x: number, y: number) => new FakeGameObject(x, y),
    },
  } as unknown as Phaser.Scene;
  const send = (event: string, x: number, y: number, id = 1) => input.emit(event, { id, x, y, isDown: !event.startsWith('pointerup') });
  const zone = (x: number, y: number, w: number, h: number) => new PhaserStub.Geom.Rectangle(x, y, w, h);
  return { ...touchModule, scene, send, zone };
}

describe('mirrorX', () => {
  it('flips a position across the middle for the left-handed layout only', async () => {
    const right = await setup();
    expect(right.mirrorX(right.scene, 700)).toBe(700);
    const left = await setup({ mirrored: true });
    expect(left.mirrorX(left.scene, 700)).toBe(100);
  });
});

describe('VirtualStick', () => {
  it('reports how far the knob is dragged, up to its radius', async () => {
    const { VirtualStick, scene, send, zone } = await setup();
    const stick = new VirtualStick(scene, zone(0, 0, 400, 600), 60);
    send('pointerdown', 100, 300);
    send('pointermove', 130, 300);
    expect(stick.x).toBeCloseTo(0.5);
    expect(stick.y).toBeCloseTo(0);
    // 200 px is well past the 60 px radius: the knob stops at the edge.
    send('pointermove', 300, 300);
    expect(stick.x).toBe(1);
    send('pointermove', 100, 100);
    expect(stick.value).toEqual({ x: expect.closeTo(0), y: -1 });
  });

  it('goes back to rest on release', async () => {
    const { VirtualStick, scene, send, zone } = await setup();
    const stick = new VirtualStick(scene, zone(0, 0, 400, 600), 60);
    send('pointerdown', 100, 300);
    send('pointermove', 300, 300);
    send('pointerup', 300, 300);
    expect(stick.value).toEqual({ x: 0, y: 0 });
    // A finger that slid off the canvas releases it too.
    send('pointerdown', 100, 300);
    send('pointermove', 100, 500);
    send('pointerupoutside', 100, 700);
    expect(stick.value).toEqual({ x: 0, y: 0 });
  });

  it('only starts from a touch inside its zone, and follows one finger', async () => {
    const { VirtualStick, scene, send, zone } = await setup();
    const stick = new VirtualStick(scene, zone(0, 0, 400, 600), 60);
    send('pointerdown', 600, 300, 1);
    send('pointermove', 700, 300, 1);
    expect(stick.x).toBe(0);
    send('pointerdown', 100, 300, 2);
    send('pointermove', 100, 400, 2);
    expect(stick.y).toBe(1);
    // Another finger moving elsewhere does not steer it.
    send('pointermove', 700, 100, 1);
    expect(stick.y).toBe(1);
  });

  it('moves its zone to the other side for the left-handed layout', async () => {
    const { VirtualStick, scene, send, zone } = await setup({ mirrored: true });
    const stick = new VirtualStick(scene, zone(0, 0, 400, 600), 60);
    send('pointerdown', 100, 300);
    send('pointermove', 200, 300);
    expect(stick.x).toBe(0);
    send('pointerup', 200, 300);
    send('pointerdown', 700, 300);
    send('pointermove', 600, 300);
    expect(stick.x).toBe(-1);
  });

  it('grows with the touch scale setting', async () => {
    const { VirtualStick, scene, send, zone } = await setup({ scale: 1.5 });
    const stick = new VirtualStick(scene, zone(0, 0, 400, 600), 60);
    send('pointerdown', 100, 300);
    // 60 px is the whole radius at scale 1, and two thirds of the 90 px one here.
    send('pointermove', 160, 300);
    expect(stick.x).toBeCloseTo(2 / 3);
  });
});

describe('VirtualButton', () => {
  it('is down while any finger is on it', async () => {
    const { VirtualButton, scene, send } = await setup({ haptics: false });
    const button = new VirtualButton(scene, 700, 500, 'A');
    expect(button.isDown).toBe(false);
    send('pointerdown', 100, 100, 1);
    expect(button.isDown).toBe(false);
    send('pointerdown', 700, 500, 2);
    send('pointerdown', 710, 505, 3);
    expect(button.isDown).toBe(true);
    send('pointerup', 700, 500, 2);
    expect(button.isDown).toBe(true);
    send('pointerup', 710, 505, 3);
    expect(button.isDown).toBe(false);
    expect(button.contains(700, 500)).toBe(true);
    expect(button.contains(100, 100)).toBe(false);
  });

  it('sits on the other side for the left-handed layout', async () => {
    const { VirtualButton, scene, send } = await setup({ mirrored: true, haptics: false });
    const button = new VirtualButton(scene, 700, 500, 'A');
    send('pointerdown', 700, 500);
    expect(button.isDown).toBe(false);
    send('pointerdown', 100, 500);
    expect(button.isDown).toBe(true);
  });
});
