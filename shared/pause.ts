import Phaser from 'phaser';
import type { ArcadeControls } from './controls';
import { isMuted, setMuted } from './sfx';
import { NEON, neonText, PIXEL_FONT } from './ui';

export interface PauseOptions {
  /** Return false while pausing makes no sense (level transition, game over). */
  canPause?: () => boolean;
  onChange?: (paused: boolean) => void;
}

/**
 * Standard pause and mute behaviour: P / Esc / Start toggle pause, M / Back toggle mute,
 * and the game pauses itself when the tab or window loses focus.
 * Pausing freezes physics, tweens and timers and shows an overlay.
 */
export class PauseController {
  private paused = false;
  private readonly overlay: Phaser.GameObjects.Container;
  private readonly muteText: Phaser.GameObjects.Text;

  constructor(
    private readonly scene: Phaser.Scene,
    controls: ArcadeControls<string> | ArcadeControls<string>[],
    private readonly opts: PauseOptions = {},
  ) {
    const { width, height } = scene.scale.gameSize;
    const dim = scene.add.rectangle(0, 0, width, height, NEON.bg, 0.6).setOrigin(0);
    const title = neonText(scene, width / 2, height / 2 - 16, 'PAUSED', 36, NEON.yellow);
    const hint = neonText(scene, width / 2, height / 2 + 34, 'P / ESC / START TO RESUME', 10, NEON.white).setAlpha(0.7);
    this.overlay = scene.add.container(0, 0, [dim, title, hint]).setDepth(1000).setVisible(false);
    this.muteText = scene.add
      .text(width - 16, height - 12, '', { fontFamily: PIXEL_FONT, fontSize: '10px', color: '#8a8ab8' })
      .setOrigin(1, 0.5)
      .setDepth(1000);
    this.updateMuteText();

    // In local multiplayer every player can pause or mute.
    const all = Array.isArray(controls) ? controls : [controls];
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
    // scene.events outlives a scene restart, so every listener added here is removed on shutdown.
    scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
    scene.game.events.on(Phaser.Core.Events.BLUR, onBlur);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
      scene.game.events.off(Phaser.Core.Events.BLUR, onBlur);
    });

    // Tapping the overlay also resumes, so touch players aren't stuck. Only interactive while shown.
    this.dim = dim.on('pointerdown', () => this.paused && this.toggle());
  }

  private readonly dim: Phaser.GameObjects.Rectangle;

  get isPaused(): boolean {
    return this.paused;
  }

  toggle(): void {
    if (!this.paused && this.opts.canPause && !this.opts.canPause()) return;
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
    if (this.paused) this.dim.setInteractive();
    else this.dim.disableInteractive();
    this.opts.onChange?.(this.paused);
  }

  private updateMuteText(): void {
    this.muteText.setText(isMuted() ? 'MUTED (M)' : '');
  }
}
