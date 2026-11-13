import { defineConfig } from 'vitest/config';

// Kept separate from vite.config.ts so tests do not load the PWA plugin or the multi-page inputs.
// Tests cover the Phaser-free modules (rules, data tables, storage), so plain node is enough.
export default defineConfig({
  test: {
    environment: 'node',
    // Several suites re-import modules per test; the first import can take seconds on a busy machine.
    testTimeout: 20000,
    include: ['{games,shared,src,scripts,build}/**/*.test.{ts,mjs}'],
  },
});
