import Phaser from 'phaser';
import { onUnlock } from './achievements';
import { registerOffline } from './pwa';
import { getSettings } from './settings';
import { showToast } from './toast';
import { PIXEL_FONT } from './ui';

export interface ArcadeGameOptions {
  width?: number;
  height?: number;
  backgroundColor?: string;
  scenes: Phaser.Types.Scenes.SceneType[];
  physics?: Phaser.Types.Core.PhysicsConfig;
}

/**
 * With reduced motion on, camera shake and flash become no-ops for every game, so no game has to
 * remember to check the setting before each effect.
 */
function applyReducedMotion(): void {
  if (!getSettings().reducedMotion) return;
  const proto = Phaser.Cameras.Scene2D.Camera.prototype as unknown as Record<'shake' | 'flash', (...args: unknown[]) => unknown>;
  proto.shake = function (this: unknown) {
    return this;
  };
  proto.flash = function (this: unknown) {
    return this;
  };
}

/** Standard Phaser setup for arcade games: fixed logical resolution scaled to fit any screen. */
export function createArcadeGame(opts: ArcadeGameOptions): Phaser.Game {
  applyReducedMotion();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: opts.width ?? 800,
    height: opts.height ?? 600,
    backgroundColor: opts.backgroundColor ?? '#05050d',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: opts.physics ?? { default: 'arcade', arcade: { debug: false } },
    // Three pointers so a touch stick and two buttons can be held at once; gamepads via the Gamepad API.
    input: { activePointers: 3, gamepad: true },
    scene: opts.scenes,
  });
  // Handy for debugging and automated tests in `npm run dev`; stripped from production builds.
  if (import.meta.env.DEV) (window as unknown as { game: Phaser.Game }).game = game;
  return game;
}

/**
 * Waits (briefly) for the pixel font so Phaser doesn't render text in the fallback font, then starts the game.
 * Use this from each game's main.ts.
 */
export async function startArcadeGame(opts: ArcadeGameOptions): Promise<Phaser.Game> {
  registerOffline();
  onUnlock((t) => showToast('Trophy unlocked', t.title));
  try {
    await Promise.race([document.fonts.load(`16px ${PIXEL_FONT}`), new Promise((r) => setTimeout(r, 1500))]);
  } catch {
    /* font loading unsupported; fall back to monospace */
  }
  return createArcadeGame(opts);
}
