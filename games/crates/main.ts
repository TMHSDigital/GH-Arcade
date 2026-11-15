import '../../shared/game-shell.css';
import { startArcadeGame } from '../../shared/phaser-config';
import { ArcadeGameOverScene } from '../../shared/scenes';
import { HEIGHT, WIDTH } from './config';
import { GameScene } from './scenes/GameScene';
import { MenuScene } from './scenes/MenuScene';
import { SelectScene } from './scenes/SelectScene';

// The first scene listed starts first. The shared modules expect the keys in SCENE (shared/scenes.ts);
// the level select between the menu and the game is this game's own.
void startArcadeGame({
  width: WIDTH,
  height: HEIGHT,
  scenes: [MenuScene, SelectScene, GameScene, ArcadeGameOverScene],
});
