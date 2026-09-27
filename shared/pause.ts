import Phaser from 'phaser';
import type { ArcadeControls } from './controls';
import { OptionMenu } from './menu';
import { isMuted, setMuted } from './sfx';
import { NEON, neonText, PIXEL_FONT } from './ui';

export interface PauseOptions {
  /** Return false while pausing makes no sense (level transition, game over). */
  canPause?: () => boolean;
  onChange?: (paused: boolean) => void;
  /** Data for "Restart"; defaults to whatever the scene was started with. */
  restartData?: object;
}

/** Window events linking the page's on-screen pause button to the game. */
export const PAUSE_REQUEST_EVENT = 'arcade:toggle-pause';
export const PAUSE_STATE_EVENT = 'arcade:pause-state';

/**
 * Standard pause and mute behaviour: P / Esc / Start (or the on-screen pause button) toggle pause,
 * M / Back toggle mute, and the game pauses itself when the tab or window loses focus.
 * Pausing freezes physics, tweens and timers and shows a menu: Resume, Restart, Main menu, Arcade.
 */
export class PauseController {
  private paused = false;
  private readonly overlay: Phaser.GameObjects.Container;
  private readonly muteText: Phaser.GameObjects.Text;
  private readonly menu: OptionMenu;

  constructor(
    private readonly scene: Phaser.Scene,
    controls: ArcadeControls<string> | ArcadeControls<string>[],
    private readonly opts: PauseOptions = {},
  ) {
    const { width, height } = scene.scale.gameSize;
    const all = Array.isArray(controls) ? controls : [controls];
    const restartData = opts.restartData ?? (scene.sys.settings.data as object | undefined) ?? {};

    // Dark enough that in-game banners behind it never compete with the menu text.
    const dim = scene.add.rectangle(0, 0, width, height, NEON.bg, 0.9).setOrigin(0);
    const title = neonText(scene, width / 2, height / 2 - 130, 'PAUSED', 36, NEON.yellow);
    const leave = (fn: () => void) => {
      // Unfreeze first so the next scene doesn't start with paused timers and tweens.
      this.toggle(true);
      fn();
    };
    this.menu = new OptionMenu(scene, all[0], {
      x: width / 2,
      y: height / 2 + 20,
      layout: 'column',
      spacing: 46,
      size: 16,
      depth: 1001,
      enabled: false,
      items: [
        { label: 'RESUME', onSelect: () => this.toggle() },
        { label: 'RESTART', onSelect: () => leave(() => scene.scene.restart(restartData)) },
        { label: 'MAIN MENU', onSelect: () => leave(() => scene.scene.start('Menu')) },
        { label: 'ARCADE', onSelect: () => leave(() => window.location.assign('../../')) },
      ],
    });
    const hint = neonText(scene, width / 2, height / 2 + 150, 'P / ESC / START TO RESUME', 10, NEON.white).setAlpha(0.6);
    this.overlay = scene.add
      .container(0, 0, [dim, title, hint, ...this.menu.objects])
      .setDepth(1000)
      .setVisible(false);
    this.muteText = scene.add
      .text(width - 16, height - 12, '', { fontFamily: PIXEL_FONT, fontSize: '10px', color: '#8a8ab8' })
      .setOrigin(1, 0.5)
      .setDepth(1000);
    this.updateMuteText();

    // In local multiplayer every player can pause or mute.
    const onUpdate = () => {
      if (all.some((c) => c.justPressed('pause'))) this.toggle();
      if (all.some((c) => c.justPressed('mute'))) {
        setMuted(!isMuted());
        this.updateMuteText();
      }
    };
    const onBlur = () => {
      if (!this.paused) this.toggle();
    };
    const onRequest = () => this.toggle();
    // scene.events outlives a scene restart, so every listener added here is removed on shutdown.
    scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
    scene.game.events.on(Phaser.Core.Events.BLUR, onBlur);
    window.addEventListener(PAUSE_REQUEST_EVENT, onRequest);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
      scene.game.events.off(Phaser.Core.Events.BLUR, onBlur);
      window.removeEventListener(PAUSE_REQUEST_EVENT, onRequest);
      window.dispatchEvent(new CustomEvent(PAUSE_STATE_EVENT, { detail: { paused: false, available: false } }));
    });
    // Let the page's pause button know a pausable game is running.
    window.dispatchEvent(new CustomEvent(PAUSE_STATE_EVENT, { detail: { paused: false, available: true } }));
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** Toggles pause. `forceResume` unpauses unconditionally (used before leaving the scene). */
  toggle(forceResume = false): void {
    if (forceResume && !this.paused) return;
    if (!forceResume && !this.paused && this.opts.canPause && !this.opts.canPause()) return;
    this.paused = !this.paused;
    const { scene } = this;
    if (this.paused) {
      scene.physics?.world?.pause();
      scene.tweens.pauseAll();
    } else {
      scene.physics?.world?.resume();
      scene.tweens.resumeAll();
    }
    scene.time.paused = this.paused;
    this.overlay.setVisible(this.paused);
    this.menu.setEnabled(this.paused);
    window.dispatchEvent(new CustomEvent(PAUSE_STATE_EVENT, { detail: { paused: this.paused, available: true } }));
    this.opts.onChange?.(this.paused);
  }

  private updateMuteText(): void {
    this.muteText.setText(isMuted() ? 'MUTED (M)' : '');
  }
}
