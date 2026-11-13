#!/usr/bin/env node
// Usage: npm run new-game <slug> ["Display Title"]
// Copies games/_template to games/<slug> and registers it on the hub.
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const [slug, titleArg] = process.argv.slice(2);

if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
  console.error('Usage: npm run new-game <slug> ["Display Title"]\n  slug: lowercase letters, numbers and dashes, e.g. space-dodge');
  process.exit(1);
}

const dest = join(root, 'games', slug);
if (existsSync(dest)) {
  console.error(`games/${slug} already exists.`);
  process.exit(1);
}

const title = (titleArg ?? slug.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')).trim();
if (!title || /[\u0000-\u001f\u007f]/.test(title)) {
  console.error('The title must not be empty or contain control characters.');
  process.exit(1);
}

// Read the registry before writing anything, so a broken registry.json cannot leave a half-made game behind.
const registryPath = join(root, 'games', 'registry.json');
const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
if (registry.some((g) => g.slug === slug)) {
  console.error(`games/registry.json already has a game with the slug "${slug}".`);
  process.exit(1);
}

// The title is free text, so escape it for each kind of file it is written into.
const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
/** Escapes for the inside of a single-quoted TypeScript string literal. */
const escapeTsString = (s) => JSON.stringify(s).slice(1, -1).replace(/'/g, "\\'");

try {
  cpSync(join(root, 'games', '_template'), dest, { recursive: true });
  for (const file of readdirSync(dest, { recursive: true })) {
    const path = join(dest, String(file));
    if (!/\.(ts|html|json|css)$/.test(path)) continue;
    const safeTitle = path.endsWith('.html') ? escapeHtml(title) : escapeTsString(title);
    // Function replacers: a plain replacement string would interpret "$$", "$&" and friends in the title.
    const text = readFileSync(path, 'utf8')
      .replaceAll('__SLUG__', () => slug)
      .replaceAll('__TITLE__', () => safeTitle);
    writeFileSync(path, text);
  }
} catch (err) {
  rmSync(dest, { recursive: true, force: true });
  throw err;
}

registry.push({
  slug,
  title,
  description: 'A brand new game. Describe it here.',
  tags: ['new'],
  accent: '#ff2e97',
  controls: 'Arrows / touch',
});
writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n');

console.log(`Created games/${slug} and added it to games/registry.json.`);
console.log(`Run "npm run dev" and open /GH-Arcade/games/${slug}/`);
console.log(
  [
    '',
    'Still to do by hand:',
    '  - games/registry.json: write the description, tags, accent color and controls hint for the hub card',
    `  - public/thumbs/${slug}.jpg: add a 16:9 screenshot and set "thumbnail" in the registry entry (optional)`,
    `  - shared/achievements.ts: add trophies with game: '${slug}' so the game shows up in the Trophies panel`,
    '  - Keep the scene keys Menu, Game and GameOver (SCENE in shared/scenes.ts); pause and game over rely on them',
  ].join('\n'),
);
