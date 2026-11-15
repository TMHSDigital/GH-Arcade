import { describe, expect, it } from 'vitest';
import { extraButtonUses, extraKeyUses, extraUsesText, GAME_EXTRAS, type GameExtras, keyCodeOf } from './extra-controls';

const EXTRAS: GameExtras[] = [
  { game: 'Neon Pinball', controls: { flipL: { label: 'Left flipper', keys: ['Z'], buttons: [4, 6] } } },
  { game: 'Neon Stack', controls: { hold: { label: 'Hold', keys: ['C', 'SHIFT'], buttons: [3, 4, 5] }, drop: { label: 'Hard drop', keys: ['SPACE'], buttons: [12] } } },
];

describe('keyCodeOf', () => {
  it('reads numbers, letters, digits and named keys', () => {
    expect(keyCodeOf(191)).toBe(191);
    expect(keyCodeOf('Z')).toBe(90);
    expect(keyCodeOf('7')).toBe(55);
    expect(keyCodeOf('SHIFT')).toBe(16);
    expect(keyCodeOf('FORWARD_SLASH')).toBe(191);
    expect(keyCodeOf('NOT_A_KEY')).toBeUndefined();
  });
});

describe('extra control uses', () => {
  it('lists the game controls a key already works', () => {
    expect(extraKeyUses(67, EXTRAS)).toEqual([{ game: 'Neon Stack', control: 'Hold' }]);
    expect(extraKeyUses(90, EXTRAS)).toEqual([{ game: 'Neon Pinball', control: 'Left flipper' }]);
    expect(extraKeyUses(75, EXTRAS)).toEqual([]);
  });

  it('lists the game controls a gamepad button already works', () => {
    expect(extraButtonUses(4, EXTRAS)).toEqual([
      { game: 'Neon Pinball', control: 'Left flipper' },
      { game: 'Neon Stack', control: 'Hold' },
    ]);
    expect(extraButtonUses(9, EXTRAS)).toEqual([]);
  });

  it('words the list for a note', () => {
    expect(extraUsesText([])).toBe('');
    expect(extraUsesText(extraButtonUses(12, EXTRAS))).toBe('Neon Stack (Hard drop)');
    expect(extraUsesText(extraButtonUses(4, EXTRAS))).toBe('Neon Pinball (Left flipper) and Neon Stack (Hold)');
  });
});

describe('the extras of the games', () => {
  it('are collected from every game that has a controls.ts, under the title of the game', () => {
    expect(GAME_EXTRAS.map((g) => g.game)).toEqual([
      'Astro Blaster',
      'Neon Crates',
      'Neon Mines',
      'Neon Pinball',
      'Neon Stack',
    ]);
  });

  it('only name keys the hub can match against a pressed key', () => {
    for (const { game, controls } of GAME_EXTRAS) {
      for (const [name, control] of Object.entries(controls)) {
        for (const key of control.keys ?? []) expect(keyCodeOf(key), `${game} ${name}: ${key}`).toBeTypeOf('number');
        expect(control.label, `${game} ${name}`).not.toBe('');
      }
    }
  });

  it('flag the cases from the report: Pause on LB or Y, Mute on C', () => {
    // LB (4) flips in Pinball and holds in Stack; Y (3) restarts in Crates, flags in Mines and holds in Stack; C holds in Stack.
    expect(extraButtonUses(4).map((u) => u.game)).toEqual(['Neon Pinball', 'Neon Stack']);
    expect(extraButtonUses(3)).toEqual([
      { game: 'Neon Crates', control: 'Restart level' },
      { game: 'Neon Mines', control: 'Flag' },
      { game: 'Neon Stack', control: 'Hold' },
    ]);
    expect(extraKeyUses(67)).toEqual([{ game: 'Neon Stack', control: 'Hold' }]);
    // Start and M are nobody's extra.
    expect(extraButtonUses(9)).toEqual([]);
    expect(extraKeyUses(77)).toEqual([]);
  });
});
