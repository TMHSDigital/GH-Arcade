import Phaser from 'phaser';
import { clearRecentUnlocks, drainRecentUnlocks, recordPlay, type Trophy } from './achievements';
import { ArcadeControls } from './controls';
import { OptionMenu } from './menu';
import { getHighScore, submitHighScore } from './storage';
import { tone } from './sfx';
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
  /**
   * Optional choices shown instead of the "press start" prompt, e.g. one or two players.
   * Players pick with left/right (keys, d-pad or stick) and confirm with Space, Enter or A, or click one.
   */
  modes?: { label: string; data: object }[];
}

/**
 * Draws the standard menu (title, best score, blinking prompt, help text) and starts the game
 * on click, tap, Space, Enter or any gamepad button. Draw any background decoration before calling this.
 */
export function buildMenu(scene: Phaser.Scene, opts: MenuOptions): void {
  // Back at the menu: anything unlocked in a run that was abandoned belongs to no end screen.
  clearRecentUnlocks();
  const { width, height } = scene.scale.gameSize;
  const [top, bottom] = opts.title;
  const [c1, c2] = opts.colors ?? [NEON.pink, NEON.cyan];
  neonText(scene, width / 2, 170, top, 56, c1);
  neonText(scene, width / 2, 240, bottom, 56, c2);

  const best = getHighScore(opts.gameId);
  if (best > 0) neonText(scene, width / 2, 320, `BEST ${best.toLocaleString()}`, 16, NEON.yellow);

  scene.add
    .text(width / 2, height - 60, opts.help, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '15px',
      color: '#8a8ab8',
      align: 'center',
      lineSpacing: 6,
    })
    .setOrigin(0.5);

  const startScene = opts.startScene ?? 'Game';
  if (opts.modes) {
    let started = false;
    new OptionMenu(scene, new ArcadeControls(scene), {
      x: width / 2,
      y: 410,
      spacing: 300,
      items: opts.modes.map((m) => ({
        label: m.label,
        onSelect: () => {
          if (started) return;
          started = true;
          fadeToScene(scene, startScene, m.data);
        },
      })),
    });
    return;
  }
  blinkingPrompt(scene, width / 2, 410, isTouchDevice() ? 'TAP TO START' : 'CLICK OR PRESS SPACE');
  onStart(scene, () => fadeToScene(scene, startScene, opts.startData ?? {}));
}

/**
 * Records a finished run: counts the play, saves the score if it is a new best, and returns the
 * trophies earned during the run. Leave `score` out for matches that have none (two-player versus);
 * the play still counts but no high score is submitted.
 */
export function finishRun(gameId: string, score?: number): { isRecord: boolean; earned: Trophy[] } {
  const isRecord = score !== undefined && submitHighScore(gameId, score);
  recordPlay(gameId, score ?? 0);
  return { isRecord, earned: drainRecentUnlocks() };
}

function trophyLine(earned: Trophy[]): string {
  const names = earned.map((t) => t.title.toUpperCase());
  return `TROPHY: ${names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2} MORE` : names.join(', ')}`;
}

export interface MatchResultOptions {
  gameId: string;
  /** Headline, e.g. "PLAYER 1 WINS!". */
  title: string;
  color: number;
  /** Final tally, e.g. "7 - 4". */
  tally: string;
  /** Data the Game scene is restarted with for a rematch. */
  rematchData: object;
}

/**
 * End screen for two-player matches, drawn over the finished game: who won, the tally, any trophies
 * earned, and Rematch / Menu options that work with keyboard, gamepad and touch. Records the play.
 */
export function showMatchResult(scene: Phaser.Scene, controls: ArcadeControls<string>, opts: MatchResultOptions): void {
  const { width, height } = scene.scale.gameSize;
  const { earned } = finishRun(opts.gameId);
  scene.add.rectangle(0, 0, width, height, NEON.bg, 0.8).setOrigin(0).setDepth(40);
  neonText(scene, width / 2, 200, opts.title, 36, opts.color).setDepth(41);
  neonText(scene, width / 2, 270, opts.tally, 28, NEON.white).setDepth(41);
  if (earned.length) neonText(scene, width / 2, 330, trophyLine(earned), 11, NEON.green).setDepth(41);
  [523, 659, 784, 1047].forEach((f, i) => scene.time.delayedCall(i * 110, () => tone({ freq: f, duration: 0.18, type: 'triangle', volume: 0.09 })));
  // Short delay so the input that ended the match doesn't instantly pick an option.
  scene.time.delayedCall(700, () => {
    let chosen = false;
    const go = (key: string, data?: object) => {
      if (chosen) return;
      chosen = true;
      fadeToScene(scene, key, data);
    };
    new OptionMenu(scene, controls, {
      x: width / 2,
      y: 400,
      spacing: 300,
      depth: 41,
      items: [
        { label: 'REMATCH', onSelect: () => go('Game', opts.rematchData) },
        { label: 'MENU', onSelect: () => go('Menu') },
      ],
    });
  });
}

export interface GameOverData {
  gameId: string;
  score: number;
  /** Optional extra line, e.g. "REACHED LEVEL 4". */
  detail?: string;
  restartScene?: string;
  restartData?: object;
}

/**
 * Shared game-over screen: final score, high-score check, any trophies earned this run, and
 * Play again / Menu options. Register it as 'GameOver'.
 */
export class ArcadeGameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOver');
  }

  create(data: GameOverData): void {
    const { width } = this.scale.gameSize;
    const { isRecord, earned } = finishRun(data.gameId, data.score);
    this.cameras.main.fadeIn(250, 5, 5, 13);

    neonText(this, width / 2, 130, 'GAME OVER', 48, NEON.pink);
    neonText(this, width / 2, 220, data.score.toLocaleString(), 40, NEON.cyan);
    if (data.detail) neonText(this, width / 2, 270, data.detail, 14, NEON.white);

    if (isRecord) {
      const record = neonText(this, width / 2, 315, 'NEW HIGH SCORE!', 18, NEON.yellow);
      this.tweens.add({ targets: record, scale: 1.15, duration: 400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else {
      neonText(this, width / 2, 315, `BEST ${getHighScore(data.gameId).toLocaleString()}`, 14, NEON.yellow);
    }

    if (earned.length) neonText(this, width / 2, 365, trophyLine(earned), 11, NEON.green);

    // Short delay so the input that ended the run doesn't instantly pick an option.
    this.time.delayedCall(600, () => {
      let chosen = false;
      const go = (key: string, payload?: object) => {
        if (chosen) return;
        chosen = true;
        fadeToScene(this, key, payload);
      };
      new OptionMenu(this, new ArcadeControls(this), {
        x: width / 2,
        y: 450,
        spacing: 300,
        size: 18,
        items: [
          { label: 'PLAY AGAIN', onSelect: () => go(data.restartScene ?? 'Game', data.restartData ?? {}) },
          { label: 'MENU', onSelect: () => go('Menu') },
        ],
      });
    });
  }
}
