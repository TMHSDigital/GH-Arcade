import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { HtmlTagDescriptor, IndexHtmlTransformContext } from 'vite';
import registry from '../games/registry.json';
import { CONTENT_SECURITY_POLICY, gamePages, gamePageTags, gameSlugOf, SITE_IMAGE, SITE_URL } from './game-pages';

const gamesDir = resolve(import.meta.dirname, '..', 'games');
const publicDir = resolve(gamesDir, '..', 'public');
const games = registry as { slug: string; title: string; description: string; thumbnail?: string }[];

/** Runs the plugin's HTML hook for a file, as Vite would. */
function tagsFor(filename: string, dev = false): HtmlTagDescriptor[] {
  const hook = gamePages(games).transformIndexHtml;
  if (typeof hook !== 'object' || !('handler' in hook)) throw new Error('expected an object hook');
  const ctx = { filename, server: dev ? {} : undefined } as IndexHtmlTransformContext;
  return hook.handler.call({} as never, '', ctx) as HtmlTagDescriptor[];
}

const find = (tags: HtmlTagDescriptor[], tag: string, attrs: Record<string, string> = {}) =>
  tags.find((t) => t.tag === tag && Object.entries(attrs).every(([k, v]) => t.attrs?.[k] === v));

/** The content of a <meta> found by its name or property. */
const meta = (tags: HtmlTagDescriptor[], id: string) =>
  (find(tags, 'meta', { name: id }) ?? find(tags, 'meta', { property: id }))?.attrs?.content as string | undefined;

const snake = { slug: 'snake', title: 'Neon Snake', description: 'Eat and grow.', thumbnail: 'thumbs/snake.jpg' };

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
  const tags = gamePageTags(snake);

  it('adds the title, icons, viewport and theme color to the head, and nothing from another host', () => {
    expect(find(tags, 'title')?.children).toBe('Neon Snake · GH Arcade');
    expect(find(tags, 'link', { rel: 'icon' })?.attrs?.href).toBe('/favicon.svg');
    expect(find(tags, 'link', { rel: 'apple-touch-icon' })).toBeDefined();
    expect(find(tags, 'meta', { name: 'viewport' })).toBeDefined();
    expect(find(tags, 'meta', { name: 'theme-color' })).toBeDefined();
    for (const url of JSON.stringify(tags).match(/https?:[^"]*/g) ?? []) expect(url.startsWith(SITE_URL)).toBe(true);
    for (const t of tags.filter((t) => ['title', 'meta', 'link'].includes(t.tag))) expect(t.injectTo).toBe('head');
  });

  it('adds the description, a canonical URL and a link preview with the game thumbnail', () => {
    const url = 'https://tmhsdigital.github.io/GH-Arcade/games/snake/';
    expect(meta(tags, 'description')).toBe('Eat and grow.');
    expect(find(tags, 'link', { rel: 'canonical' })?.attrs?.href).toBe(url);
    expect(meta(tags, 'og:url')).toBe(url);
    expect(meta(tags, 'og:title')).toBe('Neon Snake · GH Arcade');
    expect(meta(tags, 'og:description')).toBe('Eat and grow.');
    expect(meta(tags, 'og:image')).toBe('https://tmhsdigital.github.io/GH-Arcade/thumbs/snake.jpg');
    expect(meta(tags, 'og:type')).toBe('website');
    expect(meta(tags, 'og:site_name')).toBe('GH Arcade');
    expect(meta(tags, 'twitter:card')).toBe('summary_large_image');
  });

  it('falls back to a generic description and the arcade image', () => {
    const bare = gamePageTags({ slug: 'new', title: 'New Game' });
    expect(meta(bare, 'description')).toContain('New Game');
    expect(meta(bare, 'og:image')).toBe(SITE_URL + SITE_IMAGE);
  });

  it('adds the back link and the loading placeholder to the body', () => {
    expect(find(tags, 'a', { class: 'back-to-arcade' })?.attrs?.href).toBe('../../');
    expect(find(tags, 'div', { class: 'game-loading' })?.children).toBe('LOADING');
  });

  it('escapes the title', () => {
    const title = find(gamePageTags({ slug: 'tom', title: 'Tom & <Jerry>' }), 'title')?.children;
    expect(title).toBe('Tom &#38; &#60;Jerry&#62; · GH Arcade');
  });
});

describe('gamePages plugin', () => {
  it.each(games)('titles and describes $slug from the registry, with an image that exists', ({ slug, title, description, thumbnail }) => {
    const tags = tagsFor(resolve(gamesDir, slug, 'index.html'))!;
    expect(find(tags, 'title')?.children).toBe(`${title} · GH Arcade`);
    expect(meta(tags, 'description')).toBe(description);
    const image = meta(tags, 'og:image')!;
    expect(image).toBe(SITE_URL + (thumbnail ?? SITE_IMAGE));
    expect(existsSync(resolve(publicDir, image.slice(SITE_URL.length)))).toBe(true);
  });

  it('gives the hub the security policy, a description and a link preview, and nothing game-specific', () => {
    const tags = tagsFor(resolve(gamesDir, '..', 'index.html'));
    expect(tags[0].attrs?.['http-equiv']).toBe('Content-Security-Policy');
    expect(meta(tags, 'description')).toContain(`${games.length} free`);
    expect(find(tags, 'link', { rel: 'canonical' })?.attrs?.href).toBe(SITE_URL);
    expect(meta(tags, 'og:image')).toBe(SITE_URL + SITE_IMAGE);
    expect(existsSync(resolve(publicDir, SITE_IMAGE))).toBe(true);
    expect(find(tags, 'title')).toBeUndefined();
    expect(find(tags, 'a', { class: 'back-to-arcade' })).toBeUndefined();
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
    expect(tagsFor(resolve(gamesDir, '..', 'index.html'), true).some((t) => t.attrs?.['http-equiv'])).toBe(false);
    expect(tagsFor(resolve(gamesDir, 'snake', 'index.html'), true).some((t) => t.attrs?.['http-equiv'])).toBe(false);
  });

  it('allows only the arcade itself', () => {
    const directives = Object.fromEntries(CONTENT_SECURITY_POLICY.split('; ').map((d) => [d.split(' ')[0], d.split(' ').slice(1)]));
    expect(directives['default-src']).toEqual(["'self'"]);
    expect(directives['script-src']).toEqual(["'self'"]);
    expect(directives['object-src']).toEqual(["'none'"]);
    expect(directives['base-uri']).toEqual(["'none'"]);
    expect(directives['font-src']).toEqual(["'self'"]);
    expect(directives['style-src']).toEqual(["'self'"]);
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/https?:/);
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
