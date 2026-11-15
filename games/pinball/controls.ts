import type { ExtraControl } from '../../shared/extra-controls';

/**
 * Neon Pinball's own controls, beside the shared actions: Z and / and the shoulder buttons and
 * triggers work the flippers too. Plain data, so the hub can read it: it warns a player who gives
 * Pause or Mute a key or button that one of these already uses.
 */
export const EXTRA_CONTROLS = {
  flipL: { label: 'Left flipper', keys: ['Z'], buttons: [4, 6] },
  flipR: { label: 'Right flipper', keys: ['FORWARD_SLASH'], buttons: [5, 7] },
} satisfies Record<string, ExtraControl>;
