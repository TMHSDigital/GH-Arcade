import { afterEach, describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import type { Binding } from './controls';
import type { Settings } from './settings';
import { fakeInputScene, fakePad, installMemoryStorage, installWindow } from './test-utils';

vi.mock('phaser', async () => (await import('./test-utils')).phaserMock());

afterEach(() => vi.unstubAllGlobals());

const KEY = { ENTER: 13, SHIFT: 16, CTRL: 17, ESC: 27, SPACE: 32, LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, A: 65, D: 68, J: 74, M: 77, P: 80, S: 83, W: 87, X: 88 };

/** Loads ArcadeControls against clean storage with the given settings, on a fake scene. */
async function setup(settings: Partial<Settings> = {}, options: { player?: 1 | 2 } = {}, extra?: Record<string, Binding>) {
  installMemoryStorage();
  installWindow();
  vi.resetModules();
  (await import('./settings')).updateSettings(settings);
  const { ArcadeControls } = await import('./controls');
  const fake = fakeInputScene();
  const controls = new ArcadeControls<string>(fake.scene as unknown as Phaser.Scene, extra, options);
  /** True if holding the key (by keyCode) holds the action down. */
  const holds = (keyCode: number, action: string) => {
    fake.press(keyCode);
    fake.frame();
    const down = controls.isDown(action);
    fake.release(keyCode);
    fake.frame();
    return down;
  };
  return { ...fake, controls, holds };
}

describe('key bindings', () => {
  it('gives a solo player both default keys of an action', async () => {
    const { holds } = await setup();
    expect(holds(KEY.LEFT, 'left')).toBe(true);
    expect(holds(KEY.A, 'left')).toBe(true);
    expect(holds(KEY.J, 'left')).toBe(false);
  });

  it('replaces the default keys with a custom one', async () => {
    const { holds } = await setup({ bindings: { left: { code: KEY.J, label: 'J' } } });
    expect(holds(KEY.J, 'left')).toBe(true);
    expect(holds(KEY.LEFT, 'left')).toBe(false);
    expect(holds(KEY.A, 'left')).toBe(false);
  });

  it('gives player 1 the WASD half and player 2 the arrows', async () => {
    const one = await setup({}, { player: 1 });
    expect([KEY.A, KEY.D, KEY.W, KEY.S, KEY.SPACE, KEY.SHIFT].map((k, i) => one.holds(k, ['left', 'right', 'up', 'down', 'action', 'alt'][i]))).toEqual(
      Array(6).fill(true),
    );
    expect(one.holds(KEY.LEFT, 'left')).toBe(false);
    expect(one.holds(KEY.ENTER, 'action')).toBe(false);

    const two = await setup({}, { player: 2 });
    expect([KEY.LEFT, KEY.RIGHT, KEY.UP, KEY.DOWN, KEY.ENTER, KEY.CTRL].map((k, i) => two.holds(k, ['left', 'right', 'up', 'down', 'action', 'alt'][i]))).toEqual(
      Array(6).fill(true),
    );
    expect(two.holds(KEY.A, 'left')).toBe(false);
    expect(two.holds(KEY.SPACE, 'action')).toBe(false);
  });

  it('gives both seats the shared Pause and Mute keys, custom ones included', async () => {
    for (const player of [1, 2] as const) {
      const seat = await setup({}, { player });
      expect(seat.holds(KEY.P, 'pause')).toBe(true);
      expect(seat.holds(KEY.ESC, 'pause')).toBe(true);
      expect(seat.holds(KEY.M, 'mute')).toBe(true);
      expect(seat.controls.seated).toBe(true);
    }
    const rebound = await setup({ bindings: { pause: { code: KEY.J, label: 'J' } } }, { player: 2 });
    expect(rebound.holds(KEY.J, 'pause')).toBe(true);
    expect(rebound.holds(KEY.P, 'pause')).toBe(false);
  });

  it('adds the extra controls of a game beside the shared ones', async () => {
    const { holds, controls } = await setup({}, {}, { hold: { keys: ['C'], buttons: [3] } });
    expect(holds(67, 'hold')).toBe(true);
    expect(holds(KEY.SPACE, 'action')).toBe(true);
    expect(controls.seated).toBe(false);
  });
});

describe('gamepad buttons', () => {
  it('uses the custom button for solo play and for both seats', async () => {
    for (const options of [{}, { player: 1 }, { player: 2 }] as { player?: 1 | 2 }[]) {
      const { controls, pads, frame } = await setup({ padBindings: { action: { button: 5 } } }, options);
      pads.push(fakePad(0), fakePad(1));
      const pad = pads[(options.player ?? 1) - 1];
      pad.buttons[0].pressed = true;
      frame();
      expect(controls.isDown('action')).toBe(false);
      pad.buttons[5].pressed = true;
      frame();
      expect(controls.isDown('action')).toBe(true);
    }
  });

  it('reports a held button as just pressed once', async () => {
    const { controls, pads, frame } = await setup();
    pads.push(fakePad(0));
    pads[0].buttons[0].pressed = true;
    frame();
    expect(controls.justPressed('action')).toBe(true);
    expect(controls.isDown('action')).toBe(true);
    frame();
    expect(controls.justPressed('action')).toBe(false);
    expect(controls.isDown('action')).toBe(true);
  });

  it('gives each seat its own pad, by connection order', async () => {
    const solo = await setup();
    expect(solo.controls.pad).toBeUndefined();
    expect(solo.controls.usingGamepad).toBe(false);

    const two = await setup({}, { player: 2 });
    const unplugged = { ...fakePad(1), connected: false };
    two.pads.push(fakePad(2), unplugged, fakePad(0));
    expect(two.controls.pad?.index).toBe(2);

    const one = await setup({}, { player: 1 });
    one.pads.push(fakePad(2), fakePad(0));
    expect(one.controls.pad?.index).toBe(0);
    expect(one.controls.usingGamepad).toBe(true);
  });

  it('rumbles only when the player has rumble on', async () => {
    const on = await setup({ rumble: true });
    const playOn = vi.fn();
    on.pads.push({ ...fakePad(0), pad: { vibrationActuator: { playEffect: playOn } } });
    on.controls.rumble(0.5, 100);
    expect(playOn).toHaveBeenCalledTimes(1);

    const off = await setup({ rumble: false });
    const playOff = vi.fn();
    off.pads.push({ ...fakePad(0), pad: { vibrationActuator: { playEffect: playOff } } });
    off.controls.rumble(0.5, 100);
    expect(playOff).not.toHaveBeenCalled();
  });
});

describe('key presses', () => {
  it('never misses a tap shorter than one frame', async () => {
    const { controls, press, release, frame } = await setup();
    frame();
    press(KEY.SPACE);
    release(KEY.SPACE);
    frame();
    expect(controls.justPressed('action')).toBe(true);
    expect(controls.isDown('action')).toBe(false);
    frame();
    expect(controls.justPressed('action')).toBe(false);
  });

  it('does not count a key repeat as a new press', async () => {
    const { controls, press, frame } = await setup();
    press(KEY.SPACE);
    frame();
    expect(controls.justPressed('action')).toBe(true);
    press(KEY.SPACE, true);
    frame();
    expect(controls.justPressed('action')).toBe(false);
    expect(controls.isDown('action')).toBe(true);
  });
});

describe('axes', () => {
  it('returns the stick value past the deadzone and falls back to keys inside it', async () => {
    const { controls, pads, press, release } = await setup();
    pads.push(fakePad(0));
    pads[0].leftStick.x = 0.6;
    expect(controls.axisX).toBe(0.6);
    pads[0].leftStick.x = 0.2;
    expect(controls.axisX).toBe(0);
    press(KEY.RIGHT);
    expect(controls.axisX).toBe(1);
    release(KEY.RIGHT);
    press(KEY.UP);
    expect(controls.axisY).toBe(-1);
  });

  it('lets an on-screen stick beat a smaller pad value', async () => {
    const { controls, pads } = await setup();
    pads.push(fakePad(0));
    pads[0].leftStick.x = 0.4;
    controls.setStick(() => ({ x: -0.9, y: 0 }));
    expect(controls.axisX).toBe(-0.9);
    controls.setStick(() => ({ x: 0.3, y: 0 }));
    expect(controls.axisX).toBe(0.4);
  });

  it('treats a stick pushed far enough as a direction press, and virtual buttons as held', async () => {
    const { controls, pads, frame } = await setup();
    pads.push(fakePad(0));
    pads[0].leftStick.x = -0.7;
    frame();
    expect(controls.isDown('left')).toBe(true);
    expect(controls.justPressed('left')).toBe(true);
    let touching = true;
    controls.addVirtual('action', () => touching);
    frame();
    expect(controls.isDown('action')).toBe(true);
    touching = false;
    frame();
    expect(controls.isDown('action')).toBe(false);
  });
});

describe('scene shutdown', () => {
  it('stops refreshing', async () => {
    const { controls, events, press, frame, shutdown } = await setup();
    expect(events.count('preupdate')).toBe(1);
    shutdown();
    expect(events.count('preupdate')).toBe(0);
    press(KEY.SPACE);
    frame();
    expect(controls.justPressed('action')).toBe(false);
  });
});
