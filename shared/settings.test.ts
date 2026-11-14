import { afterEach, describe, expect, it, vi } from 'vitest';
import { freshModules, installMemoryStorage, installWindow } from './test-utils';

afterEach(() => vi.unstubAllGlobals());

const KEY = 'gh-arcade:settings';
const TOUCH = { haptics: true, scale: 1, mirrored: false };

describe('defaults', () => {
  it('uses the defaults when nothing is stored', async () => {
    installMemoryStorage();
    installWindow(false);
    const { settings } = await freshModules();
    expect(settings.getSettings()).toEqual({ volume: 0.8, muted: false, reducedMotion: false, palette: 'neon', bindings: {}, touch: TOUCH });
  });

  it('reduced motion follows the OS preference', async () => {
    installMemoryStorage();
    installWindow(true);
    const { settings } = await freshModules();
    expect(settings.getSettings().reducedMotion).toBe(true);
  });

  it('falls back to no reduced motion when matchMedia is unavailable', async () => {
    installMemoryStorage();
    const { settings } = await freshModules();
    expect(settings.getSettings().reducedMotion).toBe(false);
  });
});

describe('loading', () => {
  it('merges a stored partial over the defaults', async () => {
    installMemoryStorage({ [KEY]: JSON.stringify({ volume: 0.25, palette: 'colorblind' }) });
    installWindow();
    const { settings } = await freshModules();
    expect(settings.getSettings()).toMatchObject({ volume: 0.25, palette: 'colorblind', muted: false });
  });

  it('ignores malformed fields and clamps the volume', async () => {
    installMemoryStorage({ [KEY]: JSON.stringify({ volume: 7, muted: 'yes', palette: 'x', bindings: [1, 2] }) });
    installWindow();
    const { settings } = await freshModules();
    expect(settings.getSettings()).toEqual({ volume: 1, muted: false, reducedMotion: false, palette: 'neon', bindings: {}, touch: TOUCH });
  });

  it('keeps only well-formed bindings', async () => {
    const bindings = { action: { code: 75, label: 'K' }, left: { code: 'x' }, nonsense: { code: 1, label: 'Q' } };
    installMemoryStorage({ [KEY]: JSON.stringify({ bindings }) });
    installWindow();
    const { settings } = await freshModules();
    expect(settings.getSettings().bindings).toEqual({ action: { code: 75, label: 'K' } });
  });
});

describe('touch settings', () => {
  it('loads saved touch options and clamps the size', async () => {
    installMemoryStorage({ [KEY]: JSON.stringify({ touch: { haptics: false, scale: 9, mirrored: true } }) });
    installWindow();
    const { settings } = await freshModules();
    expect(settings.getSettings().touch).toEqual({ haptics: false, scale: 1.5, mirrored: true });
  });

  it('fills in defaults for missing or malformed touch fields', async () => {
    installMemoryStorage({ [KEY]: JSON.stringify({ touch: { haptics: 'yes', scale: 'big', mirrored: true } }) });
    installWindow();
    let { settings } = await freshModules();
    expect(settings.getSettings().touch).toEqual({ haptics: true, scale: 1, mirrored: true });

    installMemoryStorage({ [KEY]: JSON.stringify({ touch: 'left' }) });
    ({ settings } = await freshModules());
    expect(settings.getSettings().touch).toEqual(TOUCH);
  });

  it('saves a change and keeps it across a reload', async () => {
    installMemoryStorage();
    installWindow();
    let { settings } = await freshModules();
    settings.updateSettings({ touch: { ...settings.getSettings().touch, mirrored: true, scale: 1.2 } });
    ({ settings } = await freshModules());
    expect(settings.getSettings().touch).toEqual({ haptics: true, scale: 1.2, mirrored: true });
  });

  it('steps the button size up by 10% and wraps back to the smallest', async () => {
    installMemoryStorage();
    installWindow();
    const { settings } = await freshModules();
    const seen: number[] = [];
    let scale = 1;
    for (let i = 0; i < 8; i++) seen.push((scale = settings.nextTouchScale(scale)));
    expect(seen).toEqual([1.1, 1.2, 1.3, 1.4, 1.5, 0.8, 0.9, 1]);
    // A size the hub's slider left between two steps lands on the next whole step.
    expect(settings.nextTouchScale(1.25)).toBe(1.4);
    expect(settings.nextTouchScale(1.5)).toBe(0.8);
  });
});

describe('updateSettings', () => {
  it('persists, notifies each listener once and returns the new settings', async () => {
    const storage = installMemoryStorage();
    installWindow();
    const { settings } = await freshModules();
    const a = vi.fn();
    const b = vi.fn();
    settings.onSettingsChange(a);
    settings.onSettingsChange(b);
    const next = settings.updateSettings({ muted: true });
    expect(next.muted).toBe(true);
    expect(settings.getSettings()).toBe(next);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).toHaveBeenCalledWith(next);
    expect(JSON.parse(storage.data.get(KEY)!)).toMatchObject({ muted: true });
  });

  it('stops notifying after unsubscribe', async () => {
    installMemoryStorage();
    installWindow();
    const { settings } = await freshModules();
    const fn = vi.fn();
    const off = settings.onSettingsChange(fn);
    off();
    settings.updateSettings({ volume: 0.5 });
    expect(fn).not.toHaveBeenCalled();
  });

  it('saves only what the player changed, so reduced motion keeps following the OS', async () => {
    const storage = installMemoryStorage();
    installWindow(false);
    let { settings } = await freshModules();
    settings.updateSettings({ muted: true });
    expect(JSON.parse(storage.data.get(KEY)!)).not.toHaveProperty('reducedMotion');

    // The OS preference changes; the next load picks it up because nothing was frozen.
    installWindow(true);
    ({ settings } = await freshModules());
    expect(settings.getSettings()).toMatchObject({ muted: true, reducedMotion: true });
  });

  it('an explicit reduced-motion choice wins over the OS', async () => {
    installMemoryStorage();
    installWindow(true);
    let { settings } = await freshModules();
    settings.updateSettings({ reducedMotion: false });
    ({ settings } = await freshModules());
    expect(settings.getSettings().reducedMotion).toBe(false);
  });
});

describe('resetSettings', () => {
  it('restores the defaults and notifies', async () => {
    installMemoryStorage();
    installWindow();
    const { settings } = await freshModules();
    settings.updateSettings({ volume: 0.1, palette: 'colorblind', bindings: { action: { code: 75, label: 'K' } } });
    const fn = vi.fn();
    settings.onSettingsChange(fn);
    const reset = settings.resetSettings();
    expect(reset).toEqual({ volume: 0.8, muted: false, reducedMotion: false, palette: 'neon', bindings: {}, touch: TOUCH });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('key helpers', () => {
  it('follow a custom binding', async () => {
    installMemoryStorage();
    installWindow();
    const { settings } = await freshModules();
    expect(settings.keyCodesFor('action')).toEqual([32, 13]);
    expect(settings.keyLabel('action', true)).toBe('SPACE');
    expect(settings.keyLabel('pause')).toBe('P / ESC');
    settings.updateSettings({ bindings: { action: { code: 75, label: 'k' } } });
    expect(settings.keyCodesFor('action')).toEqual([75]);
    expect(settings.keyLabel('action', true)).toBe('K');
  });

  it('help text keeps its own wording until a key is rebound', async () => {
    installMemoryStorage();
    installWindow();
    const { settings } = await freshModules();
    expect(settings.helpKeys('pause', 'P')).toBe('P');
    expect(settings.helpKeys(['left', 'right'], '← →')).toBe('← →');
    settings.updateSettings({ bindings: { pause: { code: 75, label: 'K' }, left: { code: 74, label: 'J' } } });
    expect(settings.helpKeys('pause', 'P')).toBe('K');
    // One rebound key in a group lists every action's current keys, defaults included.
    expect(settings.helpKeys(['left', 'right'], '← →')).toBe('J, → / D');
    expect(settings.helpKeys('action', 'Space')).toBe('Space');
  });

  it('two-player modes share a rebound Pause or Mute key unless a seat uses it', async () => {
    installMemoryStorage();
    installWindow();
    const { settings } = await freshModules();
    expect(settings.sharedKeyCodes('pause')).toEqual([80, 27]);
    expect(settings.sharedKeyLabel('pause')).toBe('P / ESC');
    settings.updateSettings({ bindings: { pause: { code: 75, label: 'k' }, mute: { code: 87, label: 'W' } } });
    expect(settings.sharedKeyCodes('pause')).toEqual([75]);
    expect(settings.sharedKeyLabel('pause')).toBe('K');
    // W is player 1's up key, so Mute falls back to its default there.
    expect(settings.sharedKeyCodes('mute')).toEqual([77]);
    expect(settings.sharedKeyLabel('mute')).toBe('M');
    expect(settings.keyLabel('mute')).toBe('W');
  });
});
