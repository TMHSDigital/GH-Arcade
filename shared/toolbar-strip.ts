/**
 * How far the page buttons (the back link on the left, Pause and Fullscreen on the right) reach in
 * from the side of the window, and down from its top, at their widest labels. Matches the sizes in
 * game-shell.css.
 */
export const TOOLBAR_REACH = 200;
export const TOOLBAR_BOTTOM = 48;

/**
 * Height to keep free above the game so the page buttons never cover it. The canvas is centred and
 * scaled to fit the window. In a wide window the buttons sit on the empty margin beside it, and in a
 * tall one on the margin above it; in between they would cover the game's top corners, where most
 * games draw their HUD, so the canvas gives up a strip at the top instead.
 */
export function toolbarStrip(viewWidth: number, viewHeight: number, aspect: number): number {
  const canvasWidth = Math.min(viewWidth, viewHeight * aspect);
  const beside = (viewWidth - canvasWidth) / 2;
  const above = (viewHeight - canvasWidth / aspect) / 2;
  return beside < TOOLBAR_REACH && above < TOOLBAR_BOTTOM ? TOOLBAR_BOTTOM : 0;
}
