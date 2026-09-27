import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

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
    chunkSizeWarningLimit: 1600, // Phaser alone is ~1.2 MB minified; it is cached across games
    rollupOptions: {
      input: {
        hub: resolve(root, 'index.html'),
        ...discoverGames(),
      },
      output: {
        manualChunks: (id) => (id.includes('node_modules/phaser') ? 'phaser' : undefined),
      },
    },
  },
  plugins: [
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
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,jpg}'],
        // Raised from Workbox's 2 MB default so the ~1.5 MB shared Phaser chunk keeps fitting as it grows.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Multi-page site: every page is precached by its own URL, so no single-page fallback.
        navigateFallback: null,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-css' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-files',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
