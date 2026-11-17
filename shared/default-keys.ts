import type { RebindableAction, SharedAction } from './settings';

/**
 * The default keyboard keys, written once as Phaser key names. The controls build their bindings
 * from these, and the settings derive the keyCodes they need for start prompts and clash checks, so
 * changing a default here changes it everywhere. No Phaser here.
 */

/** Default keys per action, for one player at the keyboard. */
export const DEFAULT_KEYS: Record<RebindableAction, readonly string[]> = {
  left: ['LEFT', 'A'],
  right: ['RIGHT', 'D'],
  up: ['UP', 'W'],
  down: ['DOWN', 'S'],
  action: ['SPACE', 'ENTER'],
  alt: ['SHIFT', 'X'],
  pause: ['P', 'ESC'],
  mute: ['M'],
};

/**
 * Keyboard halves for local two-player games (each player also gets their own gamepad). Pause and
 * Mute are shared by both seats and follow the player's settings; see sharedKeyCodes().
 */
export const PLAYER_KEYS: Record<1 | 2, Record<Exclude<RebindableAction, SharedAction>, readonly string[]>> = {
  1: { left: ['A'], right: ['D'], up: ['W'], down: ['S'], action: ['SPACE'], alt: ['SHIFT'] },
  2: { left: ['LEFT'], right: ['RIGHT'], up: ['UP'], down: ['DOWN'], action: ['ENTER'], alt: ['CTRL'] },
};

/** keyCodes of the named keys games use in bindings (Phaser's names). Letters and digits need no entry. */
const NAMED_KEY_CODES: Record<string, number> = {
  BACKSPACE: 8,
  TAB: 9,
  ENTER: 13,
  SHIFT: 16,
  CTRL: 17,
  ALT: 18,
  ESC: 27,
  SPACE: 32,
  LEFT: 37,
  UP: 38,
  RIGHT: 39,
  DOWN: 40,
  SEMICOLON: 186,
  COMMA: 188,
  MINUS: 189,
  PERIOD: 190,
  FORWARD_SLASH: 191,
  OPEN_BRACKET: 219,
  BACK_SLASH: 220,
  CLOSED_BRACKET: 221,
  QUOTES: 222,
};

/** The keyCode of a key as a binding writes it: a number, a letter or digit, or one of the named keys. */
export function keyCodeOf(key: string | number): number | undefined {
  if (typeof key === 'number') return key;
  if (/^[A-Z0-9]$/.test(key)) return key.charCodeAt(0);
  return NAMED_KEY_CODES[key];
}

/** keyCodes of a list of key names. Throws on a name with no known code, so a typo fails the tests. */
export function keyCodesOf(keys: readonly string[]): number[] {
  return keys.map((key) => {
    const code = keyCodeOf(key);
    if (code === undefined) throw new Error(`No keyCode for key "${key}"`);
    return code;
  });
}
