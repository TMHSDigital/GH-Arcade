import type { ExtraControl } from '../../shared/extra-controls';
import { PAD } from '../../shared/gamepad';

/**
 * Neon Mines' own controls, beside the shared actions (Action reveals, Alt flags). Plain data, so the
 * hub can read it: it warns a player who gives Pause or Mute a key or button that one of these uses.
 */
export const EXTRA_CONTROLS = {
  flag: { label: 'Flag', keys: ['F'], buttons: [PAD.y] },
  flagMode: { label: 'Flag mode', keys: ['T'], buttons: [PAD.x] },
} satisfies Record<string, ExtraControl>;
