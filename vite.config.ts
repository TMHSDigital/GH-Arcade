import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { gamePages } from './build/game-pages.ts';
import registry from './games/registry.json' with { type: 'json' };

const root = import.meta.dirname;
const BASE = '/GH-Arcade/';

// Every games/<slug>/index.html becomes its own page. Folders starting with "_" (e.g. _template) are skipped.
function discoverGames(): Record<string, string> {
  const gamesDir = resolve(root, 'games');
  const entries: Record<string, string> = {};
  for (const dirent of readdirSync(gamesDir, { withFileTypes: true })) {
    if (!dirent.isDirectory() || dirent.name.startsWith('_')) continue;
    const html = resolve(gamesDir, dirent.name, 'index.html');
    if (existsSync(html)) entries[dirent.name] = html;
  }
  return entries;
}

export default defineConfig({
  // Project Pages site lives at https://tmhsdigital.github.io/GH-Arcade/
  base: BASE,
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1600, // Phaser alone is ~1.5 MB minified; it is cached across games
    rollupOptions: {
      input: {
        hub: resolve(root, 'index.html'),
        // GitHub Pages serves dist/404.html for any missing address on the site.
        notFound: resolve(root, '404.html'),
        ...discoverGames(),
      },
      output: {
        manualChunks: (id) => (id.includes('node_modules/phaser') ? 'phaser' : undefined),
      },
    },
  },
  plugins: [
    // Shared head tags, title, back link and loader for every game page.
    gamePages(registry),
    // Installable app with offline play: the service worker precaches the hub, every game and the shared
    // Phaser chunk, so once the arcade has loaded online it works with no connection at all.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // registered from shared/pwa.ts on every page
      // Every built file (icons included) is picked up by globPatterns below, so nothing is listed twice.
      includeManifestIcons: false,
      manifest: {
        name: 'GH Arcade',
        short_name: 'GH Arcade',
        description: 'A neon arcade of free browser games. Plays offline once installed.',
        id: BASE,
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'any',
        background_color: '#05050d',
        theme_color: '#05050d',
        categories: ['games', 'entertainment'],
        shortcuts: registry.slice(0, 4).map((game) => ({
          name: game.title,
          description: game.description,
          url: `${BASE}games/${game.slug}/`,
          icons: [{ src: 'pwa-192.png', sizes: '192x192', type: 'image/png' }],
        })),
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // A new version takes over as soon as it is installed, so shared/pwa.ts can reload the hub into it.
        // The plugin only turns these on by itself when it injects the registration, and it does not here
        // (injectRegister: false), so without them an update waits until every arcade tab is closed.
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,woff2}'],
        // Only link previews fetch the share image, so it does not need to work offline.
        globIgnores: ['social.jpg'],
        // Raised from Workbox's 2 MB default so the ~1.5 MB shared Phaser chunk keeps fitting as it grows.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Multi-page site: every page is precached by its own URL, so no single-page fallback.
        navigateFallback: null,
        // A game page opened on a mode or a daily challenge day (games/stack/?mode=daily&day=2026-11-13,
        // shared/modes.ts) is still the precached page.
        ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^mode$/, /^day$/],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
