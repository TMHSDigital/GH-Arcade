import Phaser from 'phaser';
import { clearRecentUnlocks, drainRecentUnlocks, getHighScore, recordRun, TOP_SIZE, type Trophy } from './achievements';
import { ArcadeControls } from './controls';
import { OptionMenu } from './menu';
import { tone } from './sfx';
import { keyLabel } from './settings';
import { canShare, resultText, shareResult } from './share';
import { showToast } from './toast';
import { isTouchDevice } from './touch';
import { blinkingPrompt, fadeToScene, NEON, neonText, onStart } from './ui';

/**
 * Scene keys the shared modules rely on. Every game registers a menu scene as 'Menu', its gameplay
 * scene as 'Game' and the shared ArcadeGameOverScene ('GameOver'); the pause menu, the menu's start
 * prompt and the game-over options all navigate by these keys.
 */
export const SCENE = { menu: 'Menu', game: 'Game', gameOver: 'GameOver' } as const;

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

  const startScene = opts.startScene ?? SCENE.game;
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
  blinkingPrompt(scene, width / 2, 410, isTouchDevice() ? 'TAP TO START' : `CLICK OR PRESS ${keyLabel('action', true)}`);
  onStart(scene, () => fadeToScene(scene, startScene, opts.startData ?? {}));
}

/**
 * Records a finished run: counts the play, keeps the score if it is a new best or makes the game's
 * top scores (`rank` is its place there, or 0), and returns the trophies earned during the run.
 * Leave `score` out for matches that have none (two-player versus); the play still counts but
 * cannot be a record.
 */
export function finishRun(gameId: string, score?: number): { isRecord: boolean; rank: number; earned: Trophy[] } {
  const { isRecord, rank } = recordRun(gameId, score ?? 0);
  return { isRecord: isRecord && score !== undefined, rank: score === undefined ? 0 : rank, earned: drainRecentUnlocks() };
}

const restartData = new WeakMap<Phaser.Scene, object>();

/**
 * Sets the data a scene is restarted with (pause menu RESTART, game over PLAY AGAIN). PauseController
 * calls this with its `restartData` option, so each game states it once. Pass undefined to clear it.
 */
export function setRestartData(scene: Phaser.Scene, data: object | undefined): void {
  if (data) restartData.set(scene, data);
  else restartData.delete(scene);
}

/** The data to restart a scene with: what setRestartData recorded, else whatever the scene was started with. */
export function restartDataFor(scene: Phaser.Scene): object {
  return restartData.get(scene) ?? (scene.sys.settings.data as object | undefined) ?? {};
}

const endedScenes = new WeakSet<Phaser.Scene>();

/**
 * Ends a run: after `delayMs` (time for the death effects to play), hands over to the shared
 * game-over screen. Only the first call per run counts, so two things ending the run in the same
 * moment cannot start the screen twice. PLAY AGAIN restarts with `data.restartData`, or with the
 * same data the pause menu's RESTART uses.
 */
export function endRun(scene: Phaser.Scene, data: GameOverData, delayMs = 0): void {
  if (endedScenes.has(scene)) return;
  endedScenes.add(scene);
  // Scene instances are reused, so the guard is lifted when this run's scene shuts down.
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => endedScenes.delete(scene));
  const payload: GameOverData = { ...data, restartData: data.restartData ?? restartDataFor(scene) };
  const start = () => scene.scene.start(SCENE.gameOver, payload);
  if (delayMs > 0) scene.time.delayedCall(delayMs, start);
  else start();
}

/** Leaves the game page for the hub, which is two folders up from every game. */
export function toArcade(): void {
  window.location.assign('../../');
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
 * earned, and Rematch / Menu / Arcade options that work with keyboard, gamepad and touch. Records the play.
 */
export function showMatchResult(
  scene: Phaser.Scene,
  controls: ArcadeControls<string> | ArcadeControls<string>[],
  opts: MatchResultOptions,
): void {
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
      spacing: 240,
      depth: 41,
      items: [
        { label: 'REMATCH', onSelect: () => go(SCENE.game, opts.rematchData) },
        { label: 'MENU', onSelect: () => go(SCENE.menu) },
        { label: 'ARCADE', onSelect: toArcade },
      ],
    });
  });
}

export interface GameOverData {
  gameId: string;
  score: number;
  /** Optional extra line, e.g. "REACHED LEVEL 4". */
  detail?: string;
  /** The UTC date of the daily challenge this run was, if it was one; the shared result names it. */
  daily?: string;
  restartScene?: string;
  restartData?: object;
}

/**
 * Shared game-over screen: final score, high-score check, any trophies earned this run, and
 * Play again / Menu / Arcade options, plus Share where the browser can share or copy text.
 * Its key is SCENE.gameOver.
 */
export class ArcadeGameOverScene extends Phaser.Scene {
  constructor() {
    super(SCENE.gameOver);
  }

  create(data: GameOverData): void {
    const { width } = this.scale.gameSize;
    const { isRecord, rank, earned } = finishRun(data.gameId, data.score);
    this.cameras.main.fadeIn(250, 5, 5, 13);

    neonText(this, width / 2, 130, 'GAME OVER', 48, NEON.pink);
    neonText(this, width / 2, 220, data.score.toLocaleString(), 40, NEON.cyan);
    if (data.detail) neonText(this, width / 2, 270, data.detail, 14, NEON.white);

    if (isRecord) {
      const record = neonText(this, width / 2, 315, 'NEW HIGH SCORE!', 18, NEON.yellow);
      this.tweens.add({ targets: record, scale: 1.15, duration: 400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else {
      // Not a record, but a run that made the game's top scores still gets a mention.
      const placed = rank > 1 ? `NO. ${rank} IN YOUR TOP ${TOP_SIZE}   ` : '';
      neonText(this, width / 2, 315, `${placed}BEST ${getHighScore(data.gameId).toLocaleString()}`, 14, NEON.yellow);
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
      // Sharing stays on this screen, so the player can still pick where to go next.
      const share = async () => {
        if (chosen) return;
        // The page is titled "<game> · GH Arcade" (build/game-pages.ts).
        const text = resultText({ title: document.title.split(' · ')[0], score: data.score, daily: data.daily });
        const outcome = await shareResult(text, window.location.origin + window.location.pathname);
        if (outcome === 'copied') showToast('Copied', 'Paste your result anywhere');
        else if (outcome === 'failed') showToast("Couldn't share", 'Pick SHARE with a key, click or tap');
      };
      const shareable = canShare();
      new OptionMenu(this, new ArcadeControls(this), {
        x: width / 2,
        y: 450,
        // Four options need to sit closer together to fit the screen.
        spacing: shareable ? 180 : 240,
        size: 16,
        items: [
          { label: 'PLAY AGAIN', onSelect: () => go(data.restartScene ?? SCENE.game, data.restartData ?? {}) },
          { label: 'MENU', onSelect: () => go(SCENE.menu) },
          ...(shareable ? [{ label: 'SHARE', onSelect: () => void share() }] : []),
          // The natural exit point: back to the hub without starting another run first.
          { label: 'ARCADE', onSelect: toArcade },
        ],
      });
    });
  }
}
