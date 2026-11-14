import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveConfig } from 'vite';
import type { ManifestOptions, VitePluginPWAAPI } from 'vite-plugin-pwa';
import registry from '../games/registry.json';

async function manifest(): Promise<ManifestOptions> {
  const { default: config } = await import('../vite.config');
  const resolved = await resolveConfig({ ...config, configFile: false }, 'build');
  const api = resolved.plugins.find((plugin) => plugin.name === 'vite-plugin-pwa')?.api as VitePluginPWAAPI;
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
