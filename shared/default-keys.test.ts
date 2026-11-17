import { describe, expect, it } from 'vitest';
import { DEFAULT_KEYS, keyCodeOf, keyCodesOf, PLAYER_KEYS } from './default-keys';
import { DEFAULT_KEY_CODES, REBINDABLE } from './settings';

describe('default keys', () => {
  it('give the settings the keyCodes of the keys the controls bind', () => {
    for (const action of REBINDABLE) expect(DEFAULT_KEY_CODES[action], action).toEqual(DEFAULT_KEYS[action].map((k) => keyCodeOf(k)));
    expect(DEFAULT_KEY_CODES).toEqual({
      left: [37, 65],
      right: [39, 68],
      up: [38, 87],
      down: [40, 83],
      action: [32, 13],
      alt: [16, 88],
      pause: [80, 27],
      mute: [77],
    });
  });

  it('give the two seats separate halves of the keyboard', () => {
    const one = Object.values(PLAYER_KEYS[1]).flatMap(keyCodesOf);
    const two = Object.values(PLAYER_KEYS[2]).flatMap(keyCodesOf);
    expect(one.filter((code) => two.includes(code))).toEqual([]);
    expect(one).toEqual([65, 68, 87, 83, 32, 16]);
    expect(two).toEqual([37, 39, 38, 40, 13, 17]);
  });

  it('refuse a key name with no keyCode, so a typo fails here', () => {
    expect(() => keyCodesOf(['SPACEBAR'])).toThrow('SPACEBAR');
  });
});
