import { describe, expect, it } from 'vitest';
import { TOOLBAR_BOTTOM, toolbarStrip } from './toolbar-strip';

const ASPECT = 800 / 600;

describe('toolbarStrip', () => {
  it('keeps a strip free when the canvas would reach under the buttons', () => {
    // The window from the bug report: nearly 4:3, so the canvas spans almost the full width.
    expect(toolbarStrip(1100, 760, ASPECT)).toBe(TOOLBAR_BOTTOM);
    expect(toolbarStrip(1024, 768, ASPECT)).toBe(TOOLBAR_BOTTOM);
    // A phone held sideways: margins beside the canvas, but narrower than the buttons.
    expect(toolbarStrip(800, 360, ASPECT)).toBe(TOOLBAR_BOTTOM);
  });

  it('leaves the canvas alone when the buttons fit beside it', () => {
    expect(toolbarStrip(1920, 1080, ASPECT)).toBe(0);
    expect(toolbarStrip(1500, 800, ASPECT)).toBe(0);
  });

  it('leaves the canvas alone when the buttons fit above it', () => {
    expect(toolbarStrip(400, 800, ASPECT)).toBe(0);
    expect(toolbarStrip(760, 1100, ASPECT)).toBe(0);
  });

  it('follows the shape of the game', () => {
    // A tall game leaves wide margins in a window where a 4:3 one would not.
    expect(toolbarStrip(1100, 760, 480 / 720)).toBe(0);
    expect(toolbarStrip(520, 760, 480 / 720)).toBe(TOOLBAR_BOTTOM);
  });
});
