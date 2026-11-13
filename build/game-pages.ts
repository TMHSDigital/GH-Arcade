import type { HtmlTagDescriptor, Plugin } from 'vite';

/**
 * Everything the game pages have in common, defined once. Each games/<slug>/index.html holds only
 * what is specific to it (the canvas container and its script); this plugin adds the shared head
 * tags, the page title from games/registry.json, the back link and the loading placeholder, in dev
 * and in the build alike.
 */

export interface GameInfo {
  slug: string;
  title: string;
}

const FONTS = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Space+Grotesk:wght@400;500;700&display=swap';

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** The slug of the game a page belongs to, or null for the hub and anything else. */
export function gameSlugOf(filename: string): string | null {
  return filename.replace(/\\/g, '/').match(/\/games\/([^/]+)\/index\.html$/)?.[1] ?? null;
}

/** The tags added to a game page. `title` is plain text; it is escaped here. */
export function gamePageTags(title: string): HtmlTagDescriptor[] {
  return [
    { tag: 'meta', attrs: { name: 'viewport', content: 'width=device-width, initial-scale=1.0, user-scalable=no' }, injectTo: 'head' },
    { tag: 'meta', attrs: { name: 'theme-color', content: '#05050d' }, injectTo: 'head' },
    { tag: 'title', children: `${escapeHtml(title)} · GH Arcade`, injectTo: 'head' },
    { tag: 'link', attrs: { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' }, injectTo: 'head' },
    { tag: 'link', attrs: { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }, injectTo: 'head' },
    { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.googleapis.com' }, injectTo: 'head' },
    { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: true }, injectTo: 'head' },
    { tag: 'link', attrs: { href: FONTS, rel: 'stylesheet' }, injectTo: 'head' },
    { tag: 'a', attrs: { class: 'back-to-arcade', href: '../../' }, children: '← Arcade', injectTo: 'body-prepend' },
    { tag: 'div', attrs: { class: 'game-loading', 'aria-hidden': 'true' }, children: 'LOADING', injectTo: 'body-prepend' },
  ];
}

/** Vite plugin: applies gamePageTags to every games/<slug>/index.html, titled from the registry. */
export function gamePages(games: GameInfo[]): Plugin {
  const titles = new Map(games.map((g) => [g.slug, g.title]));
  return {
    name: 'gh-arcade:game-pages',
    transformIndexHtml: {
      // Before Vite's own HTML handling, so the icon links get the base path like hand-written ones.
      order: 'pre',
      handler(_html, ctx) {
        const slug = gameSlugOf(ctx.filename);
        if (!slug) return;
        // A game that is not in the registry yet still gets a sensible title.
        return gamePageTags(titles.get(slug) ?? slug);
      },
    },
  };
}
