import Phaser from 'phaser';

export const PIXEL_FONT = '"Press Start 2P", monospace';

/** Neon text: bright fill with a same-color shadow blur for the glow. */
export function neonText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  size: number,
  color: number,
): Phaser.GameObjects.Text {
  const hex = `#${color.toString(16).padStart(6, '0')}`;
  return scene.add
    .text(x, y, text, { fontFamily: PIXEL_FONT, fontSize: `${size}px`, color: hex, align: 'center' })
    .setOrigin(0.5)
    .setShadow(0, 0, hex, 12, false, true);
}

/** Registers a one-shot "start" action on click/tap, Space or Enter. */
export function onStart(scene: Phaser.Scene, action: () => void): void {
  let fired = false;
  const go = () => {
    if (fired) return;
    fired = true;
    action();
  };
  scene.input.once('pointerdown', go);
  scene.input.keyboard?.once('keydown-SPACE', go);
  scene.input.keyboard?.once('keydown-ENTER', go);
}
