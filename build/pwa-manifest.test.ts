import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveConfig, type UserConfig } from 'vite';
import type { ManifestOptions, VitePluginPWAAPI } from 'vite-plugin-pwa';
import registry from '../games/registry.json';

async function pwaApi(overrides: UserConfig = {}): Promise<VitePluginPWAAPI> {
  const { default: config } = await import('../vite.config');
  const resolved = await resolveConfig({ ...config, ...overrides, build: { ...config.build, ...overrides.build }, configFile: false }, 'build');
  return resolved.plugins.find((plugin) => plugin.name === 'vite-plugin-pwa')?.api as VitePluginPWAAPI;
}

async function manifest(): Promise<ManifestOptions> {
  const api = await pwaApi();
  const asset = api.generateBundle({})?.['manifest.webmanifest'];
  if (!asset || asset.type !== 'asset' || typeof asset.source !== 'string') {
    throw new Error('PWA plugin did not emit the web manifest');
  }
  return JSON.parse(asset.source) as ManifestOptions;
}

afterEach(() => {
  vi.doUnmock('../games/registry.json');
  vi.resetModules();
});

describe('PWA manifest shortcuts', () => {
  it('links the first four featured games under the Pages base path', async () => {
    const result = await manifest();
    expect(result.shortcuts).toHaveLength(4);
    for (const [index, shortcut] of result.shortcuts!.entries()) {
      const game = registry[index]!;
      expect(shortcut).toEqual({
        name: game.title,
        description: game.description,
        url: `/GH-Arcade/games/${game.slug}/`,
        icons: [{ src: 'pwa-192.png', sizes: '192x192', type: 'image/png' }],
      });
    }
  });

  it('follows a changed registry order and handles fewer than four games', async () => {
    vi.resetModules();
    vi.doMock('../games/registry.json', () => ({
      default: [
        { slug: 'second', title: 'Second game', description: 'Now featured first' },
        { slug: 'first', title: 'First game', description: 'Now featured second' },
      ],
    }));
    expect((await manifest()).shortcuts).toMatchObject([
      { name: 'Second game', description: 'Now featured first', url: '/GH-Arcade/games/second/' },
      { name: 'First game', description: 'Now featured second', url: '/GH-Arcade/games/first/' },
    ]);
  });
});

describe('service worker', () => {
  // The registration is manual (injectRegister: false), so the plugin does not add these by itself.
  // Without them a new version waits until every arcade tab is closed and the update notices never show.
  it('takes over as soon as a new version is installed', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gh-arcade-sw-'));
    try {
      await (await pwaApi({ logLevel: 'silent', build: { outDir, emptyOutDir: false } })).generateSW();
      const sw = readFileSync(join(outDir, 'sw.js'), 'utf8');
      // Workbox writes either an unconditional self.skipWaiting() or a listener that waits for a
      // SKIP_WAITING message from the page, which the plugin's autoUpdate client never sends.
      expect(sw).toContain('self.skipWaiting()');
      expect(sw).not.toContain('SKIP_WAITING');
      expect(sw).toMatch(/clientsClaim\(\)/);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  }, 60_000);
});
