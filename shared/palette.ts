import type { Palette } from './settings';

export type AccentName = 'cyan' | 'pink' | 'yellow' | 'green' | 'orange' | 'purple' | 'blue';

/**
 * Accent palettes. 'colorblind' is based on the Okabe-Ito set, brightened for a dark background,
 * so every accent stays distinguishable with common color vision deficiencies.
 * Kept free of Phaser so the hub can show swatches without loading the game engine.
 */
export const PALETTES: Record<Palette, Record<AccentName, number>> = {
  neon: { cyan: 0x00f0ff, pink: 0xff2e97, yellow: 0xffe45e, green: 0x3dff8a, orange: 0xff8a3d, purple: 0xa45bff, blue: 0x3d7bff },
  colorblind: { cyan: 0x56b4e9, pink: 0xe08bc0, yellow: 0xf0e442, green: 0x1fc99a, orange: 0xe69f00, purple: 0xb99cff, blue: 0x3d8fe0 },
};

export function cssColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
