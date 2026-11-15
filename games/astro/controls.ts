import type { ExtraControl } from '../../shared/extra-controls';

/**
 * Astro Blaster's own controls, beside the shared actions. Plain data, so the hub can read it: it
 * warns a player who gives Pause or Mute a key or button that one of these already uses.
 */
export const EXTRA_CONTROLS = {
  fire: { label: 'Fire', keys: ['Z', 'J'], buttons: [5, 7] },
} satisfies Record<string, ExtraControl>;
