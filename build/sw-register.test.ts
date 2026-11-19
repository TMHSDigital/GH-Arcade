import { describe, expect, it, vi } from 'vitest';
import type { VitePWAOptions } from 'vite-plugin-pwa';

// Capture the options object passed to VitePWA so we can assert the resolved workbox settings.
// The plugin only infers skipWaiting/clientsClaim when injectRegister is 'auto'; registration is
// manual here (injectRegister: false), so they must be set explicitly or every update stays waiting.
const captured = vi.hoisted(() => ({ options: undefined as VitePWAOptions | undefined }));

vi.mock('vite-plugin-pwa', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vite-plugin-pwa')>();
  return {
    ...actual,
    VitePWA: (options: VitePWAOptions) => {
      captured.options = options;
      return actual.VitePWA(options);
    },
  };
});

describe('service worker activation', () => {
  it('enables skipWaiting and clientsClaim for manual registration', async () => {
    vi.resetModules();
    await import('../vite.config');
    const options = captured.options!;
    expect(options.registerType).toBe('autoUpdate');
    expect(options.injectRegister).toBe(false);
    expect(options.workbox?.skipWaiting).toBe(true);
    expect(options.workbox?.clientsClaim).toBe(true);
  });
});
