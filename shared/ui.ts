import Phaser from 'phaser';
import { type AccentName, cssColor, PALETTES } from './palette';
import { getSettings, keyCodesFor } from './settings';

export const PIXEL_FONT = '"Press Start 2P", monospace';

/** The active colors, chosen from the player's palette setting when the page loads. */
export const NEON: Readonly<Record<AccentName | 'white' | 'muted' | 'bg', number>> = {
  ...PALETTES[getSettings().palette] ?? PALETTES.neon,
  white: 0xffffff,
  muted: 0x8a8ab8,
  bg: 0x05050d,
};

/** The one text style for in-game HUD values (score, lives, level). Spread it to vary size or color. */
export const HUD_STYLE = { fontFamily: PIXEL_FONT, fontSize: '16px', color: '#e8e8ff' } as const;
/** Small muted captions above HUD values. */
export const HUD_LABEL_STYLE = { fontFamily: PIXEL_FONT, fontSize: '10px', color: '#8a8ab8' } as const;

/** Adds HUD text in the shared style, optionally at another size. */
export function hudText(scene: Phaser.Scene, x: number, y: number, text: string, size = 16): Phaser.GameObjects.Text {
  return scene.add.text(x, y, text, { ...HUD_STYLE, fontSize: `${size}px` });
}

/** True when the player asked for reduced motion: skip decorative animation. */
export function reducedMotion(): boolean {
  return getSettings().reducedMotion;
}

/** A color number as a CSS hex string, e.g. for Phaser text styles. Same helper the hub uses for swatches. */
export const hex = cssColor;

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

/** Registers a one-shot "start" action on click/tap, the player's Action key (Space or Enter by default) or any gamepad button. */
export function onStart(scene: Phaser.Scene, action: () => void): void {
  let fired = false;
  const go = () => {
    if (fired) return;
    fired = true;
    action();
  };
  scene.input.once('pointerdown', go);
  const codes = keyCodesFor('action');
  const onKey = (e: KeyboardEvent) => {
    if (codes.includes(e.keyCode)) go();
  };
  scene.input.keyboard?.on('keydown', onKey);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.input.keyboard?.off('keydown', onKey));
  scene.input.gamepad?.once('down', go);
}

/** Blinking "press start" style prompt. */
export function blinkingPrompt(scene: Phaser.Scene, x: number, y: number, text: string, size = 16): Phaser.GameObjects.Text {
  const prompt = neonText(scene, x, y, text, size, NEON.white);
  if (!reducedMotion()) scene.tweens.add({ targets: prompt, alpha: 0.2, duration: 600, yoyo: true, repeat: -1 });
  return prompt;
}

/** Faint grid backdrop, available to any scene (the Snake menu and the game template use it). */
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

/**
 * Big centered banner that pops in and fades out. A new banner at the same height replaces the
 * previous one, so quick successive events (e.g. back-to-back line clears) never draw on top of each other.
 */
export function showBanner(scene: Phaser.Scene, text: string, color: number = NEON.cyan, y?: number): void {
  const { width, height } = scene.scale.gameSize;
  const by = y ?? height / 2 + 40;
  const slot = `banner:${Math.round(by)}`;
  const previous = scene.data.get(slot) as Phaser.GameObjects.Text | undefined;
  if (previous?.active) {
    scene.tweens.killTweensOf(previous);
    previous.destroy();
  }
  const banner = neonText(scene, width / 2, by, text, 28, color).setDepth(30).setScale(0.5).setAlpha(0);
  scene.data.set(slot, banner);
  scene.tweens.chain({
    targets: banner,
    tweens: [
      { scale: 1, alpha: 1, duration: 300, ease: 'Back.easeOut' },
      { alpha: 0, duration: 400, delay: 900 },
    ],
    onComplete: () => banner.destroy(),
  });
}

/** Adds a soft neon glow around an image. Does nothing on the Canvas renderer, which has no filters. */
export function addGlow(image: Phaser.GameObjects.Image, color: number, strength: number): void {
  // Filters are clipped to the image's own bounds unless the padding override is cleared.
  image.enableFilters().filters?.internal.addGlow(color, strength, 0, 1, false).setPaddingOverride(null);
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

/** Camera shake strength that counts as a full-strength rumble; the hardest hits in the games use it. */
const FULL_SHAKE = 0.012;

/**
 * Marks an impact: shakes the screen and rumbles the gamepad of each player it happened to (a
 * player's ArcadeControls, or several). Rumble strength follows the shake's intensity.
 */
export function impact(
  scene: Phaser.Scene,
  controls: { rumble(strength: number, ms: number): void } | { rumble(strength: number, ms: number): void }[],
  ms: number,
  intensity: number,
): void {
  scene.cameras.main.shake(ms, intensity);
  for (const c of Array.isArray(controls) ? controls : [controls]) c.rumble(intensity / FULL_SHAKE, ms);
}
