import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { HtmlTagDescriptor, IndexHtmlTransformContext } from 'vite';
import registry from '../games/registry.json';
import { gamePages, gamePageTags, gameSlugOf } from './game-pages';

const gamesDir = resolve(import.meta.dirname, '..', 'games');
const games = registry as { slug: string; title: string }[];

/** Runs the plugin's HTML hook for a file, as Vite would. */
function tagsFor(filename: string): HtmlTagDescriptor[] | undefined {
  const hook = gamePages(games).transformIndexHtml;
  if (typeof hook !== 'object' || !('handler' in hook)) throw new Error('expected an object hook');
  return hook.handler.call({} as never, '', { filename } as IndexHtmlTransformContext) as HtmlTagDescriptor[] | undefined;
}

const find = (tags: HtmlTagDescriptor[], tag: string, attrs: Record<string, string> = {}) =>
  tags.find((t) => t.tag === tag && Object.entries(attrs).every(([k, v]) => t.attrs?.[k] === v));

describe('gameSlugOf', () => {
  it('finds the game for a page, on any path style', () => {
    expect(gameSlugOf('/repo/games/snake/index.html')).toBe('snake');
    expect(gameSlugOf('E:\\repo\\games\\space-dodge\\index.html')).toBe('space-dodge');
  });

  it('is null for the hub and other files', () => {
    expect(gameSlugOf('/repo/index.html')).toBeNull();
    expect(gameSlugOf('/repo/games/snake/main.ts')).toBeNull();
  });
});

describe('gamePageTags', () => {
  const tags = gamePageTags('Neon Snake');

  it('adds the title, icons, viewport, theme color and font stylesheet to the head', () => {
    expect(find(tags, 'title')?.children).toBe('Neon Snake · GH Arcade');
    expect(find(tags, 'link', { rel: 'icon' })?.attrs?.href).toBe('/favicon.svg');
    expect(find(tags, 'link', { rel: 'apple-touch-icon' })).toBeDefined();
    expect(find(tags, 'meta', { name: 'viewport' })).toBeDefined();
    expect(find(tags, 'meta', { name: 'theme-color' })).toBeDefined();
    expect(String(find(tags, 'link', { rel: 'stylesheet' })?.attrs?.href)).toContain('fonts.googleapis.com');
    for (const t of tags.filter((t) => ['title', 'meta', 'link'].includes(t.tag))) expect(t.injectTo).toBe('head');
  });

  it('adds the back link and the loading placeholder to the body', () => {
    expect(find(tags, 'a', { class: 'back-to-arcade' })?.attrs?.href).toBe('../../');
    expect(find(tags, 'div', { class: 'game-loading' })?.children).toBe('LOADING');
  });

  it('escapes the title', () => {
    const title = find(gamePageTags('Tom & <Jerry>'), 'title')?.children;
    expect(title).toBe('Tom &#38; &#60;Jerry&#62; · GH Arcade');
  });
});

describe('gamePages plugin', () => {
  it.each(games)('titles $slug from the registry', ({ slug, title }) => {
    const tags = tagsFor(resolve(gamesDir, slug, 'index.html'))!;
    expect(find(tags, 'title')?.children).toBe(`${title} · GH Arcade`);
  });

  it('leaves the hub alone', () => {
    expect(tagsFor(resolve(gamesDir, '..', 'index.html'))).toBeUndefined();
  });

  it('falls back to the slug for a game that is not registered yet', () => {
    expect(find(tagsFor('/repo/games/brand-new/index.html')!, 'title')?.children).toBe('brand-new · GH Arcade');
  });
});

describe('game index.html files', () => {
  const pages = readdirSync(gamesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(resolve(gamesDir, d.name, 'index.html')))
    .map((d) => d.name);

  it.each(pages)('%s keeps only its own markup, leaving the shared tags to the plugin', (name) => {
    const html = readFileSync(resolve(gamesDir, name, 'index.html'), 'utf8');
    expect(html).toContain('<div id="game"></div>');
    expect(html).toContain('<script type="module" src="./main.ts"></script>');
    for (const shared of ['<title', 'rel="icon"', 'fonts.googleapis.com', 'name="viewport"', 'game-loading', 'back-to-arcade']) {
      expect(html, `${name} repeats ${shared}`).not.toContain(shared);
    }
  });
});
