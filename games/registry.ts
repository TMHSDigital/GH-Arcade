import registry from './registry.json';

/** A game as games/registry.json lists it: what the hub shows on its card. */
export interface GameEntry {
  slug: string;
  title: string;
  description: string;
  tags: string[];
  accent: string;
  controls?: string;
  /** Optional 16:9 screenshot in public/, e.g. thumbs/snake.jpg. Without one the card shows the title's first letter. */
  thumbnail?: string;
}

/** Every game in games/registry.json, in the order the hub features them. Plain data, no Phaser. */
export const GAMES: GameEntry[] = registry as GameEntry[];
