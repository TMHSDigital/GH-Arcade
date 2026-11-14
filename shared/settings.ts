import { isRecord, loadJSON, onExternalChange, saveJSON } from './storage';

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

/** Options for the on-screen controls shown on touch screens. */
export interface TouchSettings {
  /** A short vibration when an on-screen button is pressed (where the device supports it). */
  haptics: boolean;
  /** Size multiplier for the on-screen stick and buttons. */
  scale: number;
  /** Left-handed layout: the stick and buttons swap sides. */
  mirrored: boolean;
}

export const TOUCH_SCALE_MIN = 0.8;
export const TOUCH_SCALE_MAX = 1.5;

/** The next on-screen button size for a menu that steps through them: 10% bigger, wrapping from the largest back to the smallest. */
export function nextTouchScale(scale: number): number {
  const next = Math.round(scale * 10) + 1;
  return next > Math.round(TOUCH_SCALE_MAX * 10) ? TOUCH_SCALE_MIN : next / 10;
}

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
  touch: TouchSettings;
}

const KEY = 'settings';
/** Bumped when the saved shape changes, so a later version can tell old saves apart. */
const SAVE_VERSION = 1;

/** Keeps only the well-formed fields of a saved value; anything missing or malformed falls back to its default. */
function sanitize(raw: unknown): Partial<Settings> {
  if (!isRecord(raw)) return {};
  const out: Partial<Settings> = {};
  if (typeof raw.volume === 'number' && Number.isFinite(raw.volume)) out.volume = Math.min(1, Math.max(0, raw.volume));
  if (typeof raw.muted === 'boolean') out.muted = raw.muted;
  if (typeof raw.reducedMotion === 'boolean') out.reducedMotion = raw.reducedMotion;
  if (raw.palette === 'neon' || raw.palette === 'colorblind') out.palette = raw.palette;
  if (isRecord(raw.bindings)) {
    const bindings: Settings['bindings'] = {};
    for (const action of REBINDABLE) {
      const b = raw.bindings[action];
      if (isRecord(b) && typeof b.code === 'number' && Number.isFinite(b.code) && typeof b.label === 'string') {
        bindings[action] = { code: b.code, label: b.label };
      }
    }
    out.bindings = bindings;
  }
  if (isRecord(raw.touch)) {
    const t = raw.touch;
    const base = defaults().touch;
    out.touch = {
      haptics: typeof t.haptics === 'boolean' ? t.haptics : base.haptics,
      scale: typeof t.scale === 'number' && Number.isFinite(t.scale) ? Math.min(TOUCH_SCALE_MAX, Math.max(TOUCH_SCALE_MIN, t.scale)) : base.scale,
      mirrored: typeof t.mirrored === 'boolean' ? t.mirrored : base.mirrored,
    };
  }
  return out;
}

function save(overrides: Partial<Settings>): void {
  saveJSON(KEY, { version: SAVE_VERSION, ...overrides });
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function defaults(): Settings {
  return {
    volume: 0.8,
    muted: false,
    reducedMotion: prefersReducedMotion(),
    palette: 'neon',
    bindings: {},
    touch: { haptics: true, scale: 1, mirrored: false },
  };
}

/**
 * Only what the player has explicitly changed is saved. Everything else resolves from defaults()
 * on each load, so an option the player never touched (reduced motion) keeps following the OS.
 */
function readOverrides(): Partial<Settings> {
  return sanitize(loadJSON<unknown>(KEY, {}));
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
  save(overrides);
  listeners.forEach((fn) => fn(current));
  return current;
}

export function resetSettings(): Settings {
  overrides = {};
  current = defaults();
  save(overrides);
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

/** Actions both players share in two-player modes, where every other key belongs to one seat. */
export type SharedAction = 'pause' | 'mute';

/** keyCodes of the two keyboard halves in two-player modes: W A S D Space Shift, and the arrows Enter Ctrl. */
const SEAT_KEY_CODES: readonly number[] = [87, 65, 83, 68, 32, 16, 38, 37, 40, 39, 13, 17];

/** The player's own key for a shared action, unless one of the two-player seats already uses that key. */
function sharedBinding(action: SharedAction): KeyBinding | undefined {
  const custom = current.bindings[action];
  return custom && !SEAT_KEY_CODES.includes(custom.code) ? custom : undefined;
}

/** The keyCodes that trigger Pause or Mute in two-player modes: the custom key if no seat uses it, or the defaults. */
export function sharedKeyCodes(action: SharedAction): number[] {
  const custom = sharedBinding(action);
  return custom ? [custom.code] : DEFAULT_KEY_CODES[action];
}

/** Like keyLabel(), for Pause or Mute in two-player modes. */
export function sharedKeyLabel(action: SharedAction): string {
  return (sharedBinding(action)?.label ?? DEFAULT_KEY_LABELS[action]).toUpperCase();
}

/**
 * Key names for a game's help text. `written` is how the help words the default keys ("P", "← →",
 * "arrows / WASD") and is returned as is while none of the actions is rebound. Once one is, each
 * action's current keys are listed instead ("K", or "J, → / D"), so the help never names a key that
 * no longer works.
 */
export function helpKeys(actions: RebindableAction | readonly RebindableAction[], written: string): string {
  const list = typeof actions === 'string' ? [actions] : actions;
  if (!list.some((action) => current.bindings[action])) return written;
  return list.map((action) => current.bindings[action]?.label ?? DEFAULT_KEY_LABELS[action]).join(', ');
}

/** Calls `fn` whenever settings change. Returns an unsubscribe function. */
export function onSettingsChange(fn: (s: Settings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
