import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { HtmlTagDescriptor, IndexHtmlTransformContext } from 'vite';
import registry from '../games/registry.json';
import { CONTENT_SECURITY_POLICY, gamePages, gamePageTags, gameSlugOf } from './game-pages';

const gamesDir = resolve(import.meta.dirname, '..', 'games');
const games = registry as { slug: string; title: string }[];

/** Runs the plugin's HTML hook for a file, as Vite would. */
function tagsFor(filename: string, dev = false): HtmlTagDescriptor[] {
  const hook = gamePages(games).transformIndexHtml;
  if (typeof hook !== 'object' || !('handler' in hook)) throw new Error('expected an object hook');
  const ctx = { filename, server: dev ? {} : undefined } as IndexHtmlTransformContext;
  return hook.handler.call({} as never, '', ctx) as HtmlTagDescriptor[];
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

  it('adds nothing but the security policy to the hub', () => {
    const tags = tagsFor(resolve(gamesDir, '..', 'index.html'));
    expect(tags).toHaveLength(1);
    expect(tags[0].attrs?.['http-equiv']).toBe('Content-Security-Policy');
  });

  it('falls back to the slug for a game that is not registered yet', () => {
    expect(find(tagsFor('/repo/games/brand-new/index.html')!, 'title')?.children).toBe('brand-new · GH Arcade');
  });
});

describe('Content-Security-Policy', () => {
  it('is the first tag in the head of every built page', () => {
    for (const file of [resolve(gamesDir, '..', 'index.html'), resolve(gamesDir, 'snake', 'index.html')]) {
      const csp = tagsFor(file).find((t) => t.attrs?.['http-equiv'] === 'Content-Security-Policy')!;
      expect(csp.injectTo).toBe('head-prepend');
      expect(csp.attrs?.content).toBe(CONTENT_SECURITY_POLICY);
    }
  });

  it('is left out in the dev server, which needs inline scripts for hot reload', () => {
    expect(tagsFor(resolve(gamesDir, '..', 'index.html'), true)).toEqual([]);
    expect(tagsFor(resolve(gamesDir, 'snake', 'index.html'), true).some((t) => t.attrs?.['http-equiv'])).toBe(false);
  });

  it('allows only the arcade itself and Google Fonts', () => {
    const directives = Object.fromEntries(CONTENT_SECURITY_POLICY.split('; ').map((d) => [d.split(' ')[0], d.split(' ').slice(1)]));
    expect(directives['default-src']).toEqual(["'self'"]);
    expect(directives['script-src']).toEqual(["'self'"]);
    expect(directives['object-src']).toEqual(["'none'"]);
    expect(directives['base-uri']).toEqual(["'none'"]);
    const hosts = CONTENT_SECURITY_POLICY.match(/https:\/\/[^\s;]+/g) ?? [];
    expect([...new Set(hosts)].sort()).toEqual(['https://fonts.googleapis.com', 'https://fonts.gstatic.com']);
    expect(CONTENT_SECURITY_POLICY).not.toContain('unsafe');
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
