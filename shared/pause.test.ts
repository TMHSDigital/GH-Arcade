import { afterEach, describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import type { ArcadeControls } from './controls';
import type { MenuItem } from './menu';
import type { PauseOptions } from './pause';
import type { Settings } from './settings';
import { FakeEmitter, FakeGameObject, installMemoryStorage } from './test-utils';

vi.mock('phaser', async () => (await import('./test-utils')).phaserMock());
vi.mock('./achievements', () => ({ clearRecentUnlocks: vi.fn() }));
vi.mock('./device', () => ({ isTouchDevice: () => false }));
vi.mock('./scenes', () => ({ SCENE: { menu: 'Menu', game: 'Game', gameOver: 'GameOver' }, restartDataFor: () => ({ restarted: true }), setRestartData: vi.fn(), toArcade: vi.fn() }));
vi.mock('./ui', async () => {
  const { FakeGameObject: Fake } = await import('./test-utils');
  return { NEON: {}, PIXEL_FONT: 'pixel', neonText: (_scene: unknown, x: number, y: number, text: string) => Object.assign(new Fake(x, y), { text }) };
});
vi.mock('./sfx', () => {
  let muted = false;
  return { isMuted: () => muted, setMuted: (on: boolean) => void (muted = on) };
});
// A menu that draws nothing and remembers what it was told, so a test can pick an option by its label.
vi.mock('./menu', () => {
  class OptionMenu {
    static instances: OptionMenu[] = [];
    readonly objects: unknown[] = [];
    readonly labels: string[];
    enabled: boolean;
    visible = true;
    constructor(
      _scene: unknown,
      _controls: unknown,
      readonly opts: { items: MenuItem[]; enabled?: boolean },
    ) {
      this.labels = opts.items.map((item) => item.label);
      this.enabled = opts.enabled ?? true;
      OptionMenu.instances.push(this);
    }
    setEnabled(on: boolean): void {
      this.enabled = on;
    }
    setVisible(on: boolean): void {
      this.visible = on;
    }
    setLabel(index: number, label: string): void {
      this.labels[index] = label;
    }
  }
  return { OptionMenu };
});

afterEach(() => vi.unstubAllGlobals());

interface StubMenu {
  opts: { items: MenuItem[] };
  labels: string[];
  enabled: boolean;
  visible: boolean;
}

/** Builds a PauseController on a fake scene, with the page's window events captured. */
async function setup(opts: PauseOptions = {}, settings: Partial<Settings> = {}, sceneKeys: Record<string, unknown> = { Menu: {}, Game: {} }) {
  installMemoryStorage();
  const win = Object.assign(new EventTarget(), { matchMedia: () => ({ matches: false }) });
  vi.stubGlobal('window', win);
  vi.resetModules();
  (await import('./settings')).updateSettings(settings);
  const { PauseController, PAUSE_REQUEST_EVENT, PAUSE_STATE_EVENT } = await import('./pause');
  const menus = ((await import('./menu')).OptionMenu as unknown as { instances: StubMenu[] }).instances;
  // The stand-in outlives a module reset, so start each test with no menus from the one before.
  menus.length = 0;

  const states: { paused: boolean; available: boolean }[] = [];
  win.addEventListener(PAUSE_STATE_EVENT, (e) => states.push((e as CustomEvent).detail));

  const events = new FakeEmitter();
  const gameEvents = new FakeEmitter();
  const sceneCalls = { restart: vi.fn(), start: vi.fn() };
  const tweens = { pauseAll: vi.fn(), resumeAll: vi.fn() };
  const world = { pause: vi.fn(), resume: vi.fn() };
  const time = { paused: false };
  const scene = {
    events,
    game: { events: gameEvents },
    scale: { gameSize: { width: 800, height: 600 } },
    add: { rectangle: () => new FakeGameObject(), text: () => new FakeGameObject(), container: () => new FakeGameObject() },
    scene: { manager: { keys: sceneKeys }, ...sceneCalls },
    tweens,
    time,
    physics: { world },
  } as unknown as Phaser.Scene;

  const pressed = new Set<string>();
  const controls = { seated: false, justPressed: (name: string) => pressed.has(name) } as unknown as ArcadeControls<string>;
  const pause = new PauseController(scene, controls, opts);
  const [main, settingsMenu] = menus;

  return {
    pause,
    states,
    tweens,
    world,
    time,
    sceneCalls,
    main,
    settingsMenu,
    /** One scene update with these actions just pressed, then the end of the frame. */
    frame(...names: string[]) {
      names.forEach((n) => pressed.add(n));
      events.emit('update');
      pressed.clear();
      events.emit('postupdate');
    },
    endFrame: () => events.emit('postupdate'),
    blur: () => gameEvents.emit('blur'),
    padLost: () => win.dispatchEvent(new Event('gamepaddisconnected')),
    request: () => win.dispatchEvent(new Event(PAUSE_REQUEST_EVENT)),
    shutdown: () => events.emit('shutdown'),
    /** Picks an option of a menu by its original label. */
    choose(menu: StubMenu, label: string) {
      const item = menu.opts.items.find((i) => i.label === label);
      if (!item) throw new Error(`no ${label} option`);
      item.onSelect();
    },
    volume: async () => (await import('./settings')).getSettings().volume,
  };
}

describe('pausing', () => {
  it('announces a pausable game when it is created', async () => {
    const { states, pause } = await setup();
    expect(states).toEqual([{ paused: false, available: true }]);
    expect(pause.isPaused).toBe(false);
  });

  it('freezes time, tweens and physics, shows the menu and tells the page', async () => {
    const onChange = vi.fn();
    const { pause, time, tweens, world, states, main, settingsMenu } = await setup({ onChange });
    pause.toggle();
    expect(pause.isPaused).toBe(true);
    expect(time.paused).toBe(true);
    expect(tweens.pauseAll).toHaveBeenCalledTimes(1);
    expect(world.pause).toHaveBeenCalledTimes(1);
    expect(states.at(-1)).toEqual({ paused: true, available: true });
    expect(onChange).toHaveBeenCalledWith(true);
    expect(main).toMatchObject({ enabled: true, visible: true });
    expect(settingsMenu).toMatchObject({ enabled: false, visible: false });
  });

  it('resumes: everything runs again and the menus are switched off', async () => {
    const onChange = vi.fn();
    const { pause, time, tweens, world, states, main } = await setup({ onChange });
    pause.toggle();
    pause.toggle();
    expect(time.paused).toBe(false);
    expect(tweens.resumeAll).toHaveBeenCalledTimes(1);
    expect(world.resume).toHaveBeenCalledTimes(1);
    expect(states.at(-1)).toEqual({ paused: false, available: true });
    expect(onChange).toHaveBeenLastCalledWith(false);
    expect(main).toMatchObject({ enabled: false, visible: false });
  });

  it('stays "paused" for the rest of the frame it was resumed in', async () => {
    const { pause, endFrame } = await setup();
    pause.toggle();
    pause.toggle();
    // The press that resumed is still "just pressed" this frame and must not reach the game.
    expect(pause.isPaused).toBe(true);
    endFrame();
    expect(pause.isPaused).toBe(false);
  });

  it('cannot be paused while the game says no, but can always be resumed', async () => {
    let allowed = false;
    const { pause, endFrame } = await setup({ canPause: () => allowed });
    pause.toggle();
    expect(pause.isPaused).toBe(false);
    allowed = true;
    pause.toggle();
    expect(pause.isPaused).toBe(true);
    allowed = false;
    pause.toggle();
    endFrame();
    expect(pause.isPaused).toBe(false);
  });

  it('force-resume does nothing to a running game and resumes a paused one', async () => {
    const { pause, time, endFrame, tweens } = await setup();
    pause.toggle(true);
    expect(time.paused).toBe(false);
    expect(tweens.pauseAll).not.toHaveBeenCalled();
    pause.toggle();
    pause.toggle(true);
    endFrame();
    expect(pause.isPaused).toBe(false);
    expect(time.paused).toBe(false);
  });
});

describe('what pauses the game', () => {
  it('the Pause key or button toggles it', async () => {
    const { pause, frame } = await setup();
    frame('pause');
    expect(pause.isPaused).toBe(true);
    frame('pause');
    expect(pause.isPaused).toBe(false);
  });

  it('the pause button on the page toggles it', async () => {
    const { pause, request, endFrame } = await setup();
    request();
    expect(pause.isPaused).toBe(true);
    request();
    endFrame();
    expect(pause.isPaused).toBe(false);
  });

  it('losing focus pauses a running game and leaves a paused one paused', async () => {
    const { pause, blur, tweens } = await setup();
    blur();
    expect(pause.isPaused).toBe(true);
    blur();
    expect(pause.isPaused).toBe(true);
    expect(tweens.pauseAll).toHaveBeenCalledTimes(1);
    expect(tweens.resumeAll).not.toHaveBeenCalled();
  });

  it('a gamepad dropping out does the same', async () => {
    const { pause, padLost, tweens } = await setup();
    padLost();
    expect(pause.isPaused).toBe(true);
    padLost();
    expect(pause.isPaused).toBe(true);
    expect(tweens.resumeAll).not.toHaveBeenCalled();
  });
});

describe('the pause menu', () => {
  it('offers MAIN MENU only when the game has a menu scene', async () => {
    const withMenu = await setup();
    expect(withMenu.main.labels).toEqual(['RESUME', 'RESTART', 'SETTINGS', 'MAIN MENU', 'ARCADE']);
    const without = await setup({}, {}, { Game: {} });
    expect(without.main.labels).toEqual(['RESUME', 'RESTART', 'SETTINGS', 'ARCADE']);
  });

  it('RESUME resumes, and RESTART unfreezes before restarting with the restart data', async () => {
    const { pause, main, choose, time, sceneCalls, endFrame } = await setup();
    pause.toggle();
    choose(main, 'RESUME');
    endFrame();
    expect(pause.isPaused).toBe(false);
    pause.toggle();
    choose(main, 'RESTART');
    expect(time.paused).toBe(false);
    expect(sceneCalls.restart).toHaveBeenCalledWith({ restarted: true });
  });

  it('opens the settings page with the current values, and BACK returns to the main page', async () => {
    const { pause, main, settingsMenu, choose } = await setup({}, { volume: 0.4, muted: true });
    pause.toggle();
    choose(main, 'SETTINGS');
    expect(settingsMenu).toMatchObject({ enabled: true, visible: true });
    expect(main).toMatchObject({ enabled: false, visible: false });
    expect(settingsMenu.labels.slice(0, 5)).toEqual(['VOLUME  40%', 'SOUND  OFF', 'MOTION  FULL', 'COLORS  NEON', 'RUMBLE  ON']);
    choose(settingsMenu, 'BACK');
    expect(main).toMatchObject({ enabled: true, visible: true });
    expect(settingsMenu).toMatchObject({ enabled: false, visible: false });
  });

  it('steps the volume up by a fifth, wrapping to 0 after 100%', async () => {
    const { settingsMenu, choose, volume } = await setup({}, { volume: 0.8 });
    choose(settingsMenu, 'VOLUME');
    expect(await volume()).toBe(1);
    choose(settingsMenu, 'VOLUME');
    expect(await volume()).toBe(0);
    choose(settingsMenu, 'VOLUME');
    expect(await volume()).toBe(0.2);
    expect(settingsMenu.labels[0]).toBe('VOLUME  20%');
  });

  it('steps a hand-edited volume to the next fifth', async () => {
    const { settingsMenu, choose, volume } = await setup({}, { volume: 0.75 });
    choose(settingsMenu, 'VOLUME');
    expect(await volume()).toBe(1);
  });

  it('the Mute key toggles sound, on the settings page too', async () => {
    const { pause, main, choose, frame } = await setup();
    const sfx = await import('./sfx');
    frame('mute');
    expect(sfx.isMuted()).toBe(true);
    pause.toggle();
    choose(main, 'SETTINGS');
    frame('mute');
    expect(sfx.isMuted()).toBe(false);
  });
});

describe('scene shutdown', () => {
  it('removes its listeners and tells the page there is nothing to pause', async () => {
    const { pause, states, shutdown, request, blur, padLost, frame } = await setup();
    shutdown();
    expect(states.at(-1)).toEqual({ paused: false, available: false });
    const sent = states.length;
    request();
    blur();
    padLost();
    frame('pause');
    expect(pause.isPaused).toBe(false);
    expect(states).toHaveLength(sent);
  });
});
