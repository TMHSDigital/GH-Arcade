import type { HtmlTagDescriptor, Plugin } from 'vite';

/**
 * Everything the game pages have in common, defined once. Each games/<slug>/index.html holds only
 * what is specific to it (the canvas container and its script); this plugin adds the shared head
 * tags, the page title from games/registry.json, the back link and the loading placeholder, in dev
 * and in the build alike. Built pages (the hub included) also get a Content-Security-Policy.
 */

export interface GameInfo {
  slug: string;
  title: string;
  description?: string;
  /** Path under public/, e.g. thumbs/snake.jpg. */
  thumbnail?: string;
}

/** Where the site is published. Link previews and search engines need absolute URLs. */
export const SITE_URL = 'https://tmhsdigital.github.io/GH-Arcade/';

/** The share image for pages without their own: a grid of game screenshots (public/social.jpg). */
export const SITE_IMAGE = 'social.jpg';

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * Content-Security-Policy for every page. GitHub Pages cannot send response headers, so it is a
 * meta tag; it is defence in depth for a static site with no user content. The arcade loads its
 * own scripts, styles and fonts, and nothing else. Changing what the pages load (a new CDN,
 * inline scripts, images from elsewhere) means updating this list.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  // Phaser and the hub set styles from script, which CSP allows; nothing uses inline style attributes or blocks.
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "form-action 'none'",
].join('; ');

/** The CSP meta tag, placed first in the head so it applies to everything after it. */
export function cspTag(): HtmlTagDescriptor {
  return { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY }, injectTo: 'head-prepend' };
}

/** The slug of the game a page belongs to, or null for the hub and anything else. */
export function gameSlugOf(filename: string): string | null {
  return filename.replace(/\\/g, '/').match(/\/games\/([^/]+)\/index\.html$/)?.[1] ?? null;
}

/** True for an index.html outside games/: the hub. Not for other pages such as 404.html. */
export function isHubPage(filename: string): boolean {
  const path = filename.replace(/\\/g, '/');
  return path.endsWith('/index.html') && !path.includes('/games/');
}

/**
 * The description, canonical URL and link-preview tags (Open Graph, read by X/Twitter too) for a
 * page. Vite escapes attribute values itself.
 */
export function shareTags(page: { title: string; description: string; path: string; image: string }): HtmlTagDescriptor[] {
  const url = SITE_URL + page.path;
  const meta = (key: 'name' | 'property', id: string, content: string): HtmlTagDescriptor => ({
    tag: 'meta',
    attrs: { [key]: id, content },
    injectTo: 'head',
  });
  return [
    meta('name', 'description', page.description),
    { tag: 'link', attrs: { rel: 'canonical', href: url }, injectTo: 'head' },
    meta('property', 'og:type', 'website'),
    meta('property', 'og:site_name', 'GH Arcade'),
    meta('property', 'og:title', page.title),
    meta('property', 'og:description', page.description),
    meta('property', 'og:url', url),
    meta('property', 'og:image', SITE_URL + page.image),
    meta('name', 'twitter:card', 'summary_large_image'),
  ];
}

/** The tags added to a game page. The title is plain text; it is escaped here. */
export function gamePageTags(game: GameInfo): HtmlTagDescriptor[] {
  const { slug, title } = game;
  return [
    { tag: 'meta', attrs: { name: 'viewport', content: 'width=device-width, initial-scale=1.0, user-scalable=no' }, injectTo: 'head' },
    { tag: 'meta', attrs: { name: 'theme-color', content: '#05050d' }, injectTo: 'head' },
    { tag: 'title', children: `${escapeHtml(title)} · GH Arcade`, injectTo: 'head' },
    ...shareTags({
      title: `${title} · GH Arcade`,
      description: game.description ?? `Play ${title} free in your browser at GH Arcade.`,
      path: `games/${slug}/`,
      image: game.thumbnail ?? SITE_IMAGE,
    }),
    { tag: 'link', attrs: { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' }, injectTo: 'head' },
    { tag: 'link', attrs: { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }, injectTo: 'head' },
    { tag: 'a', attrs: { class: 'back-to-arcade', href: '../../' }, children: '← Arcade', injectTo: 'body-prepend' },
    { tag: 'div', attrs: { class: 'game-loading', 'aria-hidden': 'true' }, children: 'LOADING', injectTo: 'body-prepend' },
  ];
}

/** The description and link-preview tags for the hub. */
export function hubTags(gameCount: number): HtmlTagDescriptor[] {
  return shareTags({
    title: 'GH Arcade',
    description: `${gameCount} free neon arcade games that play in the browser. No accounts, no ads, and they work offline once installed.`,
    path: '',
    image: SITE_IMAGE,
  });
}

/**
 * Vite plugin: applies gamePageTags to every games/<slug>/index.html, titled from the registry,
 * and hubTags to the hub. Other pages (404.html) get only the security policy.
 */
export function gamePages(games: GameInfo[]): Plugin {
  const bySlug = new Map(games.map((g) => [g.slug, g]));
  return {
    name: 'gh-arcade:game-pages',
    transformIndexHtml: {
      // Before Vite's own HTML handling, so the icon links get the base path like hand-written ones.
      order: 'pre',
      handler(_html, ctx) {
        // The dev server needs inline scripts and a websocket for hot reload, so the policy is build-only.
        const csp = ctx.server ? [] : [cspTag()];
        const slug = gameSlugOf(ctx.filename);
        if (!slug) return isHubPage(ctx.filename) ? [...csp, ...hubTags(games.length)] : csp;
        // A game that is not in the registry yet still gets a sensible title.
        return [...csp, ...gamePageTags(bySlug.get(slug) ?? { slug, title: slug })];
      },
    },
  };
}
