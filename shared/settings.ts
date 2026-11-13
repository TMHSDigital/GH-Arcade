import { loadJSON, onExternalChange, saveJSON } from './storage';

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

/** keyCodes behind the default keys above, for start prompts and for spotting clashes when rebinding. */
export const DEFAULT_KEY_CODES: Record<RebindableAction, number[]> = {
  left: [37, 65],
  right: [39, 68],
  up: [38, 87],
  down: [40, 83],
  action: [32, 13],
  alt: [16, 88],
  pause: [80, 27],
  mute: [77],
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

/**
 * Only what the player has explicitly changed is saved. Everything else resolves from defaults()
 * on each load, so an option the player never touched (reduced motion) keeps following the OS.
 */
function readOverrides(): Partial<Settings> {
  return loadJSON<Partial<Settings>>(KEY, {});
}

let overrides: Partial<Settings> = readOverrides();
let current: Settings = { ...defaults(), ...overrides };
const listeners = new Set<(s: Settings) => void>();
// Settings changed in another tab (e.g. on the hub while a game is open): adopt them, so a later
// write from this tab, such as toggling mute, does not put the old values back.
onExternalChange(KEY, () => {
  overrides = readOverrides();
  current = { ...defaults(), ...overrides };
  listeners.forEach((fn) => fn(current));
});

export function getSettings(): Readonly<Settings> {
  return current;
}

export function updateSettings(patch: Partial<Settings>): Settings {
  overrides = { ...overrides, ...patch };
  current = { ...defaults(), ...overrides };
  saveJSON(KEY, overrides);
  listeners.forEach((fn) => fn(current));
  return current;
}

export function resetSettings(): Settings {
  overrides = {};
  current = defaults();
  saveJSON(KEY, overrides);
  listeners.forEach((fn) => fn(current));
  return current;
}

/** The keyCodes that currently trigger an action for a solo player: the custom key, or the defaults. */
export function keyCodesFor(action: RebindableAction): number[] {
  const custom = current.bindings[action];
  return custom ? [custom.code] : DEFAULT_KEY_CODES[action];
}

/**
 * Upper-case key name(s) for on-screen prompts, following the player's bindings: "K" when rebound,
 * otherwise the defaults ("P / ESC"). `first` keeps only the first default key ("SPACE").
 */
export function keyLabel(action: RebindableAction, first = false): string {
  const custom = current.bindings[action];
  const label = custom ? custom.label : DEFAULT_KEY_LABELS[action];
  return (first && !custom ? label.split(' / ')[0] : label).toUpperCase();
}

/** Calls `fn` whenever settings change. Returns an unsubscribe function. */
export function onSettingsChange(fn: (s: Settings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
