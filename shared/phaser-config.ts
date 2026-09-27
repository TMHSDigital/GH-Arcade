import Phaser from 'phaser';
import { registerOffline } from './pwa';
import { PIXEL_FONT } from './ui';

export interface ArcadeGameOptions {
  width?: number;
  height?: number;
  backgroundColor?: string;
  scenes: Phaser.Types.Scenes.SceneType[];
  physics?: Phaser.Types.Core.PhysicsConfig;
}

/** Standard Phaser setup for arcade games: fixed logical resolution scaled to fit any screen. */
export function createArcadeGame(opts: ArcadeGameOptions): Phaser.Game {
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
  try {
    await Promise.race([document.fonts.load(`16px ${PIXEL_FONT}`), new Promise((r) => setTimeout(r, 1500))]);
  } catch {
    /* font loading unsupported; fall back to monospace */
  }
  return createArcadeGame(opts);
}
