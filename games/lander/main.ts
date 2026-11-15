import '../../shared/game-shell.css';
import { startArcadeGame } from '../../shared/phaser-config';
import { ArcadeGameOverScene } from '../../shared/scenes';
import { HEIGHT, WIDTH } from './config';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';

// The first scene listed starts first. The shared modules expect the keys in SCENE (shared/scenes.ts):
// 'Menu', 'Game' and 'GameOver'.
void startArcadeGame({
  width: WIDTH,
  height: HEIGHT,
  scenes: [MenuScene, GameScene, ArcadeGameOverScene],
});
