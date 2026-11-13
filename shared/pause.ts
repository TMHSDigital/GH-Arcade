import Phaser from 'phaser';
import { clearRecentUnlocks } from './achievements';
import type { ArcadeControls } from './controls';
import { type MenuItem, OptionMenu } from './menu';
import { restartDataFor, SCENE, setRestartData, toArcade } from './scenes';
import { getSettings, keyLabel, updateSettings } from './settings';
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
 * Pausing freezes physics, tweens and timers and shows a menu: Resume, Restart, Settings, Main menu,
 * Arcade. Settings opens a second page for volume, sound, motion and colors, so players (touch
 * players included) can change them without leaving the game.
 */
export class PauseController {
  private paused = false;
  /** Set on resume and cleared after the frame, so the input that chose RESUME never reaches the game. */
  private resuming = false;
  private readonly overlay: Phaser.GameObjects.Container;
  private readonly muteText: Phaser.GameObjects.Text;
  private readonly menu: OptionMenu;
  private readonly settingsMenu: OptionMenu;
  private readonly title: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;
  private readonly resumeHint: string;

  constructor(
    private readonly scene: Phaser.Scene,
    controls: ArcadeControls<string> | ArcadeControls<string>[],
    private readonly opts: PauseOptions = {},
  ) {
    const { width, height } = scene.scale.gameSize;
    const all = Array.isArray(controls) ? controls : [controls];
    // Recorded for the game-over screen too, so RESTART and PLAY AGAIN always agree.
    setRestartData(scene, opts.restartData);
    const restartData = restartDataFor(scene);

    // Dark enough that in-game banners behind it never compete with the menu text.
    const dim = scene.add.rectangle(0, 0, width, height, NEON.bg, 0.9).setOrigin(0);
    this.title = neonText(scene, width / 2, height / 2 - 150, 'PAUSED', 36, NEON.yellow);
    const leave = (fn: () => void) => {
      // Unfreeze first so the next scene doesn't start with paused timers and tweens.
      this.toggle(true);
      // The run is being abandoned, so its trophies must not show up on a later run's end screen.
      clearRecentUnlocks();
      fn();
    };
    const items: MenuItem[] = [
      { label: 'RESUME', onSelect: () => this.toggle() },
      { label: 'RESTART', onSelect: () => leave(() => scene.scene.restart(restartData)) },
      { label: 'SETTINGS', onSelect: () => this.showPage('settings') },
      { label: 'MAIN MENU', onSelect: () => leave(() => scene.scene.start(SCENE.menu)) },
      { label: 'ARCADE', onSelect: () => leave(toArcade) },
    ];
    // A game without a menu scene has nowhere for MAIN MENU to go; starting a missing scene leaves a blank canvas.
    const hasMenu = scene.scene.manager.keys[SCENE.menu] !== undefined;
    // Whoever paused should be able to work the menu, so it listens to every player's controls.
    const layout = { x: width / 2, y: height / 2 + 20, layout: 'column', spacing: 44, size: 16, depth: 1001, enabled: false } as const;
    this.menu = new OptionMenu(scene, all, { ...layout, items: hasMenu ? items : items.filter((item) => item.label !== 'MAIN MENU') });
    // Labels are filled in by refreshSettings(), which shows each option's current value.
    this.settingsMenu = new OptionMenu(scene, all, {
      ...layout,
      items: [
        // Each choice steps the volume up by 20%, wrapping back to 0 after 100.
        { label: 'VOLUME', onSelect: () => this.change({ volume: (Math.round(getSettings().volume * 5) + 1) % 6 / 5 }) },
        { label: 'SOUND', onSelect: () => this.change({ muted: !getSettings().muted }) },
        { label: 'MOTION', onSelect: () => this.change({ reducedMotion: !getSettings().reducedMotion }) },
        { label: 'COLORS', onSelect: () => this.change({ palette: getSettings().palette === 'neon' ? 'colorblind' : 'neon' }) },
        { label: 'BACK', onSelect: () => this.showPage('main') },
      ],
    });
    this.settingsMenu.setVisible(false);
    this.resumeHint = `${keyLabel('pause')} / START TO RESUME`;
    this.hint = neonText(scene, width / 2, height / 2 + 170, this.resumeHint, 10, NEON.white).setAlpha(0.6);
    this.overlay = scene.add
      .container(0, 0, [dim, this.title, this.hint, ...this.menu.objects, ...this.settingsMenu.objects])
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
    const onPostUpdate = () => {
      this.resuming = false;
    };
    // scene.events outlives a scene restart, so every listener added here is removed on shutdown.
    scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, onPostUpdate);
    scene.game.events.on(Phaser.Core.Events.BLUR, onBlur);
    window.addEventListener(PAUSE_REQUEST_EVENT, onRequest);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
      scene.events.off(Phaser.Scenes.Events.POST_UPDATE, onPostUpdate);
      scene.game.events.off(Phaser.Core.Events.BLUR, onBlur);
      window.removeEventListener(PAUSE_REQUEST_EVENT, onRequest);
      window.dispatchEvent(new CustomEvent(PAUSE_STATE_EVENT, { detail: { paused: false, available: false } }));
    });
    // Let the page's pause button know a pausable game is running.
    window.dispatchEvent(new CustomEvent(PAUSE_STATE_EVENT, { detail: { paused: false, available: true } }));
  }

  /**
   * True while paused, and for the rest of the frame in which the game was resumed: the key, button
   * or tap that resumed is still "just pressed" then, and must not also act in the game.
   */
  get isPaused(): boolean {
    return this.paused || this.resuming;
  }

  /** Toggles pause. `forceResume` unpauses unconditionally (used before leaving the scene). */
  toggle(forceResume = false): void {
    if (forceResume && !this.paused) return;
    if (!forceResume && !this.paused && this.opts.canPause && !this.opts.canPause()) return;
    this.paused = !this.paused;
    this.resuming = !this.paused;
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
    // Always open on the main page, and switch both pages off when resuming.
    this.showPage(this.paused ? 'main' : 'none');
    window.dispatchEvent(new CustomEvent(PAUSE_STATE_EVENT, { detail: { paused: this.paused, available: true } }));
    this.opts.onChange?.(this.paused);
  }

  /** Shows one page of the pause overlay (or neither, when resuming). */
  private showPage(page: 'main' | 'settings' | 'none'): void {
    const main = page === 'main';
    const settings = page === 'settings';
    // Disable before enabling, so the newly shown page starts with a clean selection.
    if (!main) this.menu.setEnabled(false);
    if (!settings) this.settingsMenu.setEnabled(false);
    this.menu.setVisible(main);
    this.settingsMenu.setVisible(settings);
    if (main) this.menu.setEnabled(true);
    if (settings) {
      this.refreshSettings();
      this.settingsMenu.setEnabled(true);
    }
    this.title.setText(settings ? 'SETTINGS' : 'PAUSED');
    this.hint.setText(settings ? 'COLORS CHANGE WHEN THE GAME RELOADS' : this.resumeHint);
  }

  /** Applies a settings change made from the pause menu. Volume, sound and motion take effect at once. */
  private change(patch: Parameters<typeof updateSettings>[0]): void {
    updateSettings(patch);
    this.refreshSettings();
    this.updateMuteText();
  }

  private refreshSettings(): void {
    const s = getSettings();
    this.settingsMenu.setLabel(0, `VOLUME  ${Math.round(s.volume * 100)}%`);
    this.settingsMenu.setLabel(1, `SOUND  ${s.muted ? 'OFF' : 'ON'}`);
    this.settingsMenu.setLabel(2, `MOTION  ${s.reducedMotion ? 'REDUCED' : 'FULL'}`);
    this.settingsMenu.setLabel(3, `COLORS  ${s.palette === 'colorblind' ? 'COLORBLIND' : 'NEON'}`);
  }

  private updateMuteText(): void {
    this.muteText.setText(isMuted() ? `MUTED (${keyLabel('mute')})` : '');
  }
}
