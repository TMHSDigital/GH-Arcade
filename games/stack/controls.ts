import type { ExtraControl } from '../../shared/extra-controls';

/**
 * Neon Stack's own controls, beside the shared actions. Plain data, so the hub can read it: it warns
 * a player who gives Pause or Mute a key or button that one of these already uses.
 */
export const EXTRA_CONTROLS = {
  rotCW: { label: 'Rotate', keys: ['UP', 'X', 'W'], buttons: [0] },
  rotCCW: { label: 'Rotate back', keys: ['Z', 'CTRL'], buttons: [1, 2] },
  hold: { label: 'Hold', keys: ['C', 'SHIFT'], buttons: [3, 4, 5] },
  drop: { label: 'Hard drop', keys: ['SPACE'], buttons: [12] },
} satisfies Record<string, ExtraControl>;
