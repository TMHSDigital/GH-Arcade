import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** A stand-in for the browser: a document that can be hidden and shown, and a wake lock that counts requests. */
function fakeBrowser(options: { refuse?: boolean } = {}) {
  const listeners: (() => void)[] = [];
  const doc = {
    visibilityState: 'visible',
    addEventListener: (_type: string, fn: () => void) => listeners.push(fn),
  };
  const locks: { released: boolean; onRelease: (() => void)[] }[] = [];
  const request = vi.fn(async () => {
    if (options.refuse) throw new Error('NotAllowedError');
    const state = { released: false, onRelease: [] as (() => void)[] };
    locks.push(state);
    return {
      addEventListener: (_type: string, fn: () => void) => state.onRelease.push(fn),
      release: async () => {
        state.released = true;
        state.onRelease.forEach((fn) => fn());
      },
    };
  });
  vi.stubGlobal('document', doc);
  vi.stubGlobal('navigator', { wakeLock: { request } });
  return {
    request,
    locks,
    /** Hides the tab (the browser releases the lock itself) or shows it again. */
    setVisible(visible: boolean) {
      doc.visibilityState = visible ? 'visible' : 'hidden';
      if (!visible) {
        for (const l of locks.filter((held) => !held.released)) {
          l.released = true;
          l.onRelease.forEach((fn) => fn());
        }
      }
      listeners.forEach((fn) => fn());
    },
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function load() {
  vi.resetModules();
  return import('./wake-lock');
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe('keepScreenAwake', () => {
  it('requests a screen lock once, however often it is asked', async () => {
    const browser = fakeBrowser();
    const { keepScreenAwake } = await load();
    keepScreenAwake(true);
    keepScreenAwake(true);
    await settle();
    keepScreenAwake(true);
    await settle();
    expect(browser.request).toHaveBeenCalledTimes(1);
    expect(browser.request).toHaveBeenCalledWith('screen');
    expect(browser.locks[0].released).toBe(false);
  });

  it('releases the lock when play stops', async () => {
    const browser = fakeBrowser();
    const { keepScreenAwake } = await load();
    keepScreenAwake(true);
    await settle();
    keepScreenAwake(false);
    await settle();
    expect(browser.locks[0].released).toBe(true);
  });

  it('releases a lock that arrives after play has already stopped', async () => {
    const browser = fakeBrowser();
    const { keepScreenAwake } = await load();
    keepScreenAwake(true);
    keepScreenAwake(false);
    await settle();
    expect(browser.locks).toHaveLength(1);
    expect(browser.locks[0].released).toBe(true);
  });

  it('asks again when the tab comes back during a run', async () => {
    const browser = fakeBrowser();
    const { keepScreenAwake } = await load();
    keepScreenAwake(true);
    await settle();
    browser.setVisible(false);
    await settle();
    expect(browser.request).toHaveBeenCalledTimes(1);
    browser.setVisible(true);
    await settle();
    expect(browser.request).toHaveBeenCalledTimes(2);
    expect(browser.locks[1].released).toBe(false);
  });

  it('does not ask again on return if play had stopped', async () => {
    const browser = fakeBrowser();
    const { keepScreenAwake } = await load();
    keepScreenAwake(true);
    await settle();
    keepScreenAwake(false);
    browser.setVisible(false);
    browser.setVisible(true);
    await settle();
    expect(browser.request).toHaveBeenCalledTimes(1);
  });

  it('carries on quietly when the browser refuses or has no wake lock', async () => {
    const refused = fakeBrowser({ refuse: true });
    const first = await load();
    first.keepScreenAwake(true);
    await settle();
    expect(refused.request).toHaveBeenCalledTimes(1);
    first.keepScreenAwake(false);

    vi.stubGlobal('navigator', {});
    const second = await load();
    expect(() => second.keepScreenAwake(true)).not.toThrow();
    await settle();
  });
});
