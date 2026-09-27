import Phaser from 'phaser';
import { COLORS, GAME_ID, WIDTH } from '../config';
import { getHighScore, submitHighScore } from '../../../shared/storage';
import { neonText, onStart } from './ui';

export interface GameOverData {
  score: number;
  level: number;
}

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOver');
  }

  create({ score, level }: GameOverData): void {
    const isRecord = submitHighScore(GAME_ID, score);

    neonText(this, WIDTH / 2, 150, 'GAME OVER', 48, COLORS.pink);
    neonText(this, WIDTH / 2, 250, score.toLocaleString(), 40, COLORS.cyan);
    neonText(this, WIDTH / 2, 300, `REACHED LEVEL ${level + 1}`, 14, COLORS.white);

    if (isRecord) {
      const record = neonText(this, WIDTH / 2, 350, 'NEW HIGH SCORE!', 18, COLORS.yellow);
      this.tweens.add({ targets: record, scale: 1.15, duration: 400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else {
      neonText(this, WIDTH / 2, 350, `BEST ${getHighScore(GAME_ID).toLocaleString()}`, 14, COLORS.yellow);
    }

    const prompt = neonText(this, WIDTH / 2, 450, 'PLAY AGAIN', 18, COLORS.white);
    this.tweens.add({ targets: prompt, alpha: 0.2, duration: 600, yoyo: true, repeat: -1 });

    // Short delay so the click that lost the last ball doesn't instantly restart.
    this.time.delayedCall(600, () => onStart(this, () => this.scene.start('Game', { level: 0, score: 0 })));
  }
}
