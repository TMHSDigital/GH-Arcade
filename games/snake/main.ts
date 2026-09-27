import '../../shared/game-shell.css';
import { startArcadeGame } from '../../shared/phaser-config';
import { ArcadeGameOverScene } from '../../shared/scenes';
import { HEIGHT, WIDTH } from './config';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';

void startArcadeGame({
  width: WIDTH,
  height: HEIGHT,
  scenes: [MenuScene, GameScene, ArcadeGameOverScene],
});
