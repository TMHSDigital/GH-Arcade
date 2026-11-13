import Phaser from 'phaser';
import { GAME_ID, HEIGHT, WIDTH } from '../config';
import { buildMenu, SCENE } from '../../../shared/scenes';
import { helpKeys } from '../../../shared/settings';
import { drawGrid } from '../../../shared/ui';

/** Title screen. Draw any backdrop first, then let buildMenu add the title, best score and start prompt. */
export class MenuScene extends Phaser.Scene {
  constructor() {
    super(SCENE.menu);
  }

  create(): void {
    drawGrid(this, WIDTH, HEIGHT);
    buildMenu(this, {
      gameId: GAME_ID,
      title: ['__TITLE__', 'GAME'],
      help: `Move: ${helpKeys(['left', 'right', 'up', 'down'], 'arrows / WASD')} / stick / hold the screen\nCollect as many dots as you can before time runs out    Pause: ${helpKeys('pause', 'P')} / Start`,
    });
  }
}
