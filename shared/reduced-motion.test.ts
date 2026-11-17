import { describe, expect, it } from 'vitest';

// Every game's source, tests left out, as text.
const sources = import.meta.glob<string>(['../games/*/**/*.ts', '!../games/**/*.test.ts'], { query: '?raw', import: 'default', eager: true });

describe('Reduced motion', () => {
  it('guards every full-screen camera flash', () => {
    const unguarded: string[] = [];
    for (const [path, text] of Object.entries(sources)) {
      text.split('\n').forEach((line, i) => {
        if (line.includes('cameras.main.flash(') && !line.includes('reducedMotion()')) unguarded.push(`${path}:${i + 1}`);
      });
    }
    expect(unguarded).toEqual([]);
  });
});
