import Phaser from 'phaser';
import { BALL_RADIUS, BRICK_H, BRICK_W, PADDLE_WIDTH } from '../config';

/** Draws every texture procedurally (white, so they can be tinted), then hands off to the menu. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    const g = this.add.graphics();

    g.fillStyle(0xffffff).fillRoundedRect(0, 0, PADDLE_WIDTH, 16, 8);
    g.generateTexture('paddle', PADDLE_WIDTH, 16);
    g.clear();

    g.fillStyle(0xffffff).fillCircle(BALL_RADIUS, BALL_RADIUS, BALL_RADIUS);
    g.generateTexture('ball', BALL_RADIUS * 2, BALL_RADIUS * 2);
    g.clear();

    // Brick: solid body with a lighter top highlight.
    g.fillStyle(0xffffff, 0.85).fillRoundedRect(0, 0, BRICK_W, BRICK_H, 4);
    g.fillStyle(0xffffff, 1).fillRoundedRect(3, 3, BRICK_W - 6, 5, 2);
    g.generateTexture('brick', BRICK_W, BRICK_H);
    g.clear();

    g.fillStyle(0xffffff).fillCircle(4, 4, 4);
    g.generateTexture('spark', 8, 8);
    g.clear();

    g.fillStyle(0xffffff).fillRoundedRect(0, 0, 40, 16, 8);
    g.generateTexture('pill', 40, 16);
    g.destroy();

    this.scene.start('Menu');
  }
}
