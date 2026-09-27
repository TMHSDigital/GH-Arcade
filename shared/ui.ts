import Phaser from 'phaser';

export const PIXEL_FONT = '"Press Start 2P", monospace';

export const NEON = {
  cyan: 0x00f0ff,
  pink: 0xff2e97,
  yellow: 0xffe45e,
  green: 0x3dff8a,
  orange: 0xff8a3d,
  purple: 0xa45bff,
  white: 0xffffff,
  muted: 0x8a8ab8,
  bg: 0x05050d,
} as const;

export function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** Neon text: bright fill with a same-color shadow blur for the glow. */
export function neonText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  size: number,
  color: number,
): Phaser.GameObjects.Text {
  const c = hex(color);
  return scene.add
    .text(x, y, text, { fontFamily: PIXEL_FONT, fontSize: `${size}px`, color: c, align: 'center' })
    .setOrigin(0.5)
    .setShadow(0, 0, c, 12, false, true);
}

/** Registers a one-shot "start" action on click/tap, Space, Enter or any gamepad button. */
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
  scene.input.gamepad?.once('down', go);
}

/** Blinking "press start" style prompt. */
export function blinkingPrompt(scene: Phaser.Scene, x: number, y: number, text: string, size = 16): Phaser.GameObjects.Text {
  const prompt = neonText(scene, x, y, text, size, NEON.white);
  scene.tweens.add({ targets: prompt, alpha: 0.2, duration: 600, yoyo: true, repeat: -1 });
  return prompt;
}

/** Faint grid backdrop used by every game. */
export function drawGrid(scene: Phaser.Scene, width: number, height: number, step = 40, color: number = NEON.purple): void {
  const g = scene.add.graphics().setDepth(-10);
  g.lineStyle(1, color, 0.08);
  for (let x = 0; x <= width; x += step) g.lineBetween(x, 0, x, height);
  for (let y = 0; y <= height; y += step) g.lineBetween(0, y, width, y);
}

/** Text that rises and fades, for score popups. */
export function floatText(scene: Phaser.Scene, x: number, y: number, text: string, color: number, size = 12): void {
  const t = neonText(scene, x, y, text, size, color).setDepth(20);
  scene.tweens.add({ targets: t, y: y - 40, alpha: 0, duration: 700, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
}

/** Big centered banner that pops in and fades out. */
export function showBanner(scene: Phaser.Scene, text: string, color: number = NEON.cyan, y?: number): void {
  const { width, height } = scene.scale.gameSize;
  const banner = neonText(scene, width / 2, y ?? height / 2 + 40, text, 28, color).setDepth(30).setScale(0.5).setAlpha(0);
  scene.tweens.chain({
    targets: banner,
    tweens: [
      { scale: 1, alpha: 1, duration: 300, ease: 'Back.easeOut' },
      { alpha: 0, duration: 400, delay: 900 },
    ],
    onComplete: () => banner.destroy(),
  });
}

/** Creates (once) and returns the key of a small white dot texture for particle effects. */
export function sparkTexture(scene: Phaser.Scene): string {
  if (!scene.textures.exists('spark')) {
    const g = scene.make.graphics({}, false);
    g.fillStyle(0xffffff).fillCircle(4, 4, 4).generateTexture('spark', 8, 8);
    g.destroy();
  }
  return 'spark';
}

/** One-shot particle emitter for bursts: call `emitter.explode(count, x, y)` after setting a tint. */
export function burstEmitter(scene: Phaser.Scene, speed = 300, lifespan = 650): Phaser.GameObjects.Particles.ParticleEmitter {
  return scene.add
    .particles(0, 0, sparkTexture(scene), {
      speed: { min: speed * 0.25, max: speed },
      lifespan,
      scale: { start: 1, end: 0 },
      alpha: { start: 1, end: 0 },
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    })
    .setDepth(50);
}

/** Fades the camera out, then starts another scene. */
export function fadeToScene(scene: Phaser.Scene, key: string, data?: object): void {
  scene.cameras.main.fadeOut(250, 5, 5, 13);
  scene.cameras.main.once('camerafadeoutcomplete', () => scene.scene.start(key, data));
}
