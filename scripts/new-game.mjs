#!/usr/bin/env node
// Usage: npm run new-game <slug> ["Display Title"]
// Copies games/_template to games/<slug> and registers it on the hub.
import { cpSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
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

const title = titleArg ?? slug.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

cpSync(join(root, 'games', '_template'), dest, { recursive: true });
for (const file of readdirSync(dest, { recursive: true })) {
  const path = join(dest, String(file));
  if (!/\.(ts|html|json|css)$/.test(path)) continue;
  const text = readFileSync(path, 'utf8').replaceAll('__SLUG__', slug).replaceAll('__TITLE__', title);
  writeFileSync(path, text);
}

const registryPath = join(root, 'games', 'registry.json');
const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
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
console.log(`Run "npm run dev" and open /GH-Game-1/games/${slug}/`);
