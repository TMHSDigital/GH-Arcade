import { loadJSON, saveJSON } from './storage';

/**
 * Arcade-wide player settings, shared by the hub and every game (saved on this device).
 * No Phaser here, so the hub can use it without loading the game engine.
 */

/** Actions players can rebind. Game-specific extras (e.g. Stack's rotate keys) keep their defaults. */
export const REBINDABLE = ['left', 'right', 'up', 'down', 'action', 'alt', 'pause', 'mute'] as const;
export type RebindableAction = (typeof REBINDABLE)[number];

/** Human-readable default keys per action, for the settings screen. */
export const DEFAULT_KEY_LABELS: Record<RebindableAction, string> = {
  left: '← / A',
  right: '→ / D',
  up: '↑ / W',
  down: '↓ / S',
  action: 'Space / Enter',
  alt: 'Shift / X',
  pause: 'P / Esc',
  mute: 'M',
};

export interface KeyBinding {
  /** KeyboardEvent.keyCode, which Phaser uses for its keys. */
  code: number;
  /** What to show the player, e.g. "K" or "Space". */
  label: string;
}

export type Palette = 'neon' | 'colorblind';

export interface Settings {
  /** Master volume, 0 to 1. */
  volume: number;
  muted: boolean;
  /** Turns off screen shake, flashes and decorative animation. */
  reducedMotion: boolean;
  /** 'colorblind' swaps the neon colors for a color-vision-deficiency-safe set (Okabe-Ito based). */
  palette: Palette;
  /** Custom keyboard keys per action, replacing that action's default keys. */
  bindings: Partial<Record<RebindableAction, KeyBinding>>;
}

const KEY = 'settings';

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function defaults(): Settings {
  return { volume: 0.8, muted: false, reducedMotion: prefersReducedMotion(), palette: 'neon', bindings: {} };
}

let current: Settings = { ...defaults(), ...loadJSON<Partial<Settings>>(KEY, {}) };
const listeners = new Set<(s: Settings) => void>();

export function getSettings(): Readonly<Settings> {
  return current;
}

export function updateSettings(patch: Partial<Settings>): Settings {
  current = { ...current, ...patch };
  saveJSON(KEY, current);
  listeners.forEach((fn) => fn(current));
  return current;
}

export function resetSettings(): Settings {
  current = defaults();
  saveJSON(KEY, current);
  listeners.forEach((fn) => fn(current));
  return current;
}

/** Calls `fn` whenever settings change. Returns an unsubscribe function. */
export function onSettingsChange(fn: (s: Settings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
