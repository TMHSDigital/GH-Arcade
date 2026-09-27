import '../../shared/game-shell.css';
import { startArcadeGame } from '../../shared/phaser-config';
import { HEIGHT, WIDTH } from './config';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { GameOverScene } from './scenes/GameOverScene';

void startArcadeGame({
  width: WIDTH,
  height: HEIGHT,
  scenes: [BootScene, MenuScene, GameScene, GameOverScene],
});
