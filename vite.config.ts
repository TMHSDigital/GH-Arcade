import { defineConfig } from 'vite';
import { readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = import.meta.dirname;

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
  // Project Pages site lives at https://tmhsdigital.github.io/GH-Game-1/
  base: '/GH-Game-1/',
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
});
