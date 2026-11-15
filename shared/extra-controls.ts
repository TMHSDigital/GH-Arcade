import registry from '../games/registry.json';
import type { Binding } from './controls';

/**
 * The controls a game adds beside the shared actions (Stack's rotate and hold, Pinball's flippers).
 * Each game with extras lists them in games/<slug>/controls.ts as plain data, so the hub can tell a
 * player when a key or button they pick for Pause or Mute already does something in a game. No
 * Phaser here.
 */
export interface ExtraControl extends Binding {
  /** What the control does, as the hub names it: "Hold", "Left flipper". */
  label: string;
}

/** A game control that already uses a key or button. */
export interface ExtraUse {
  /** The game's title. */
  game: string;
  /** The control's label. */
  control: string;
}

/** One game's extras: its title and its controls by name. */
export interface GameExtras {
  game: string;
  controls: Record<string, ExtraControl>;
}

const perGame = import.meta.glob<{ EXTRA_CONTROLS: Record<string, ExtraControl> }>('../games/*/controls.ts', { eager: true });
const titles = new Map((registry as { slug: string; title: string }[]).map((g) => [g.slug, g.title]));

/** Every game's extra controls, in the order of the game folders. */
export const GAME_EXTRAS: GameExtras[] = Object.entries(perGame)
  .filter(([path]) => !path.includes('/_'))
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, mod]) => {
    const slug = path.split('/').at(-2)!;
    return { game: titles.get(slug) ?? slug, controls: mod.EXTRA_CONTROLS };
  });

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

function usesOf(matches: (control: ExtraControl) => boolean, extras: GameExtras[]): ExtraUse[] {
  return extras.flatMap(({ game, controls }) =>
    Object.values(controls)
      .filter(matches)
      .map((control) => ({ game, control: control.label })),
  );
}

/** The game controls that a key (by keyCode) already works. */
export function extraKeyUses(code: number, extras: GameExtras[] = GAME_EXTRAS): ExtraUse[] {
  return usesOf((control) => (control.keys ?? []).some((key) => keyCodeOf(key) === code), extras);
}

/** The game controls that a gamepad button already works. */
export function extraButtonUses(button: number, extras: GameExtras[] = GAME_EXTRAS): ExtraUse[] {
  return usesOf((control) => (control.buttons ?? []).includes(button), extras);
}

/** "Neon Pinball (Left flipper) and Neon Stack (Hold)", for a note on the settings screen. */
export function extraUsesText(uses: ExtraUse[]): string {
  const parts = uses.map((use) => `${use.game} (${use.control})`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : (parts[0] ?? '');
}
