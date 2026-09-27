import '../../shared/game-shell.css';
import { createArcadeGame } from '../../shared/phaser-config';
import { HEIGHT, WIDTH } from './config';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { GameOverScene } from './scenes/GameOverScene';
import { PIXEL_FONT } from './scenes/ui';

// Wait (briefly) for the pixel font so Phaser doesn't render text in the fallback font.
async function start(): Promise<void> {
  try {
    await Promise.race([document.fonts.load(`16px ${PIXEL_FONT}`), new Promise((r) => setTimeout(r, 1500))]);
  } catch {
    /* font loading unsupported; fall back to monospace */
  }
  createArcadeGame({
    width: WIDTH,
    height: HEIGHT,
    backgroundColor: '#05050d',
    scenes: [BootScene, MenuScene, GameScene, GameOverScene],
  });
}

void start();
