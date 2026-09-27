import Phaser from 'phaser';

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
    backgroundColor: opts.backgroundColor ?? '#0b0b1a',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: opts.physics ?? { default: 'arcade', arcade: { debug: false } },
    input: { activePointers: 2 },
    scene: opts.scenes,
  });
  // Handy for debugging and automated tests in `npm run dev`; stripped from production builds.
  if (import.meta.env.DEV) (window as unknown as { game: Phaser.Game }).game = game;
  return game;
}
