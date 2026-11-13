import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scaffold, ScaffoldError } from './new-game.mjs';

const repoRoot = resolve(import.meta.dirname, '..');
let root;

const registryPath = () => join(root, 'games', 'registry.json');
const readRegistry = () => JSON.parse(readFileSync(registryPath(), 'utf8'));
/** Every file under a scaffolded game, as text. */
function gameFiles(slug) {
  const dir = join(root, 'games', slug);
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => ({ name: d.name, text: readFileSync(join(d.parentPath, d.name), 'utf8') }));
}

beforeEach(() => {
  // A throwaway project root holding a copy of the real template and a one-game registry.
  root = mkdtempSync(join(tmpdir(), 'gh-arcade-scaffold-'));
  mkdirSync(join(root, 'games'));
  cpSync(join(repoRoot, 'games', '_template'), join(root, 'games', '_template'), { recursive: true });
  writeFileSync(registryPath(), JSON.stringify([{ slug: 'existing', title: 'Existing' }], null, 2) + '\n');
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('scaffold', () => {
  it('rejects invalid slugs without writing anything', () => {
    const before = readFileSync(registryPath(), 'utf8');
    for (const slug of [undefined, '', 'Space', 'space_dodge', '-lead', 'trail-', 'a--b', '../up']) {
      expect(() => scaffold({ root, slug })).toThrow(ScaffoldError);
    }
    expect(readFileSync(registryPath(), 'utf8')).toBe(before);
    expect(readdirSync(join(root, 'games')).sort()).toEqual(['_template', 'registry.json']);
  });

  it('rejects a slug whose folder already exists', () => {
    mkdirSync(join(root, 'games', 'taken'));
    expect(() => scaffold({ root, slug: 'taken' })).toThrow(/already exists/);
    expect(readRegistry()).toHaveLength(1);
  });

  it('rejects a slug that is already in the registry', () => {
    expect(() => scaffold({ root, slug: 'existing' })).toThrow(ScaffoldError);
    expect(existsSync(join(root, 'games', 'existing'))).toBe(false);
  });

  it('rejects an empty or control-character title before writing', () => {
    expect(() => scaffold({ root, slug: 'blank', title: '   ' })).toThrow(ScaffoldError);
    expect(() => scaffold({ root, slug: 'ctrl', title: 'a\nb' })).toThrow(ScaffoldError);
    expect(existsSync(join(root, 'games', 'blank'))).toBe(false);
    expect(existsSync(join(root, 'games', 'ctrl'))).toBe(false);
  });

  it('derives the title from the slug', () => {
    expect(scaffold({ root, slug: 'space-dodge' })).toEqual({ slug: 'space-dodge', title: 'Space Dodge' });
  });

  it('leaves no placeholder behind and adds exactly one valid registry entry', () => {
    scaffold({ root, slug: 'space-dodge', title: 'Space Dodge' });
    const files = gameFiles('space-dodge');
    expect(files.length).toBeGreaterThan(3);
    for (const { name, text } of files) {
      expect(text, name).not.toContain('__SLUG__');
      expect(text, name).not.toContain('__TITLE__');
    }
    const registry = readRegistry();
    expect(registry).toHaveLength(2);
    expect(registry[1]).toMatchObject({ slug: 'space-dodge', title: 'Space Dodge' });
    expect(registry[1].tags.length).toBeGreaterThan(0);
  });

  it('escapes a hostile title for each kind of file', () => {
    const title = 'Cash $$ `Grab` ${x} <b> & "q" it\'s';
    scaffold({ root, slug: 'cash', title });
    const files = gameFiles('cash');
    const html = files.find((f) => f.name === 'index.html').text;
    expect(html).toContain('Cash $$ `Grab` ${x} &#60;b&#62; &#38; &#34;q&#34; it&#39;s');
    const menu = files.find((f) => f.name === 'MenuScene.ts').text;
    expect(menu).toContain(`'Cash $$ \`Grab\` \${x} <b> & \\"q\\" it\\'s'`);
    expect(readRegistry()[1].title).toBe(title);
  });
});
