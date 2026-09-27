import Phaser from 'phaser';
import { getHighScore, submitHighScore } from './storage';
import { isTouchDevice } from './touch';
import { blinkingPrompt, fadeToScene, NEON, neonText, onStart } from './ui';

export interface MenuOptions {
  gameId: string;
  /** Two title lines, drawn large in two neon colors. */
  title: [string, string];
  colors?: [number, number];
  /** Controls help shown at the bottom. Use \n for a second line. */
  help: string;
  /** Scene to start (defaults to 'Game') and the data to start it with. */
  startScene?: string;
  startData?: object;
}

/**
 * Draws the standard menu (title, best score, blinking prompt, help text) and starts the game
 * on click, tap, Space, Enter or any gamepad button. Draw any background decoration before calling this.
 */
export function buildMenu(scene: Phaser.Scene, opts: MenuOptions): void {
  const { width, height } = scene.scale.gameSize;
  const [top, bottom] = opts.title;
  const [c1, c2] = opts.colors ?? [NEON.pink, NEON.cyan];
  neonText(scene, width / 2, 170, top, 56, c1);
  neonText(scene, width / 2, 240, bottom, 56, c2);

  const best = getHighScore(opts.gameId);
  if (best > 0) neonText(scene, width / 2, 320, `BEST ${best.toLocaleString()}`, 16, NEON.yellow);

  blinkingPrompt(scene, width / 2, 410, isTouchDevice() ? 'TAP TO START' : 'CLICK OR PRESS SPACE');

  scene.add
    .text(width / 2, height - 60, opts.help, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '15px',
      color: '#8a8ab8',
      align: 'center',
      lineSpacing: 6,
    })
    .setOrigin(0.5);

  onStart(scene, () => fadeToScene(scene, opts.startScene ?? 'Game', opts.startData ?? {}));
}

export interface GameOverData {
  gameId: string;
  score: number;
  /** Optional extra line, e.g. "REACHED LEVEL 4". */
  detail?: string;
  restartScene?: string;
  restartData?: object;
}

/** Shared game-over screen: final score, high-score check and play again. Register it as 'GameOver'. */
export class ArcadeGameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOver');
  }

  create(data: GameOverData): void {
    const { width } = this.scale.gameSize;
    const isRecord = submitHighScore(data.gameId, data.score);
    this.cameras.main.fadeIn(250, 5, 5, 13);

    neonText(this, width / 2, 150, 'GAME OVER', 48, NEON.pink);
    neonText(this, width / 2, 250, data.score.toLocaleString(), 40, NEON.cyan);
    if (data.detail) neonText(this, width / 2, 300, data.detail, 14, NEON.white);

    if (isRecord) {
      const record = neonText(this, width / 2, 350, 'NEW HIGH SCORE!', 18, NEON.yellow);
      this.tweens.add({ targets: record, scale: 1.15, duration: 400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else {
      neonText(this, width / 2, 350, `BEST ${getHighScore(data.gameId).toLocaleString()}`, 14, NEON.yellow);
    }

    blinkingPrompt(this, width / 2, 450, 'PLAY AGAIN', 18);

    // Short delay so the input that ended the run doesn't instantly restart.
    this.time.delayedCall(600, () =>
      onStart(this, () => fadeToScene(this, data.restartScene ?? 'Game', data.restartData ?? {})),
    );
  }
}
