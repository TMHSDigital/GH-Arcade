import type { ExtraControl } from '../../shared/extra-controls';
import { PAD } from '../../shared/gamepad';

/**
 * Neon Crates' own controls, beside the shared actions. Plain data, so the hub can read it: it warns
 * a player who gives Pause or Mute a key or button that one of these already uses.
 */
export const EXTRA_CONTROLS = {
  undo: { label: 'Undo', keys: ['Z', 'BACKSPACE', 'U'], buttons: [PAD.b, PAD.x] },
  restart: { label: 'Restart level', keys: ['R'], buttons: [PAD.y] },
} satisfies Record<string, ExtraControl>;
