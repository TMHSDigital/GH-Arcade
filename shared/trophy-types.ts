/** A trophy as a game declares it. The game it belongs to comes from the folder it is declared in. */
export interface TrophyDef {
  id: string;
  title: string;
  description: string;
  /** Unlocks automatically when this counter reaches `target`. */
  counter?: string;
  target?: number;
  /**
   * The value within one run (score, level, length) that earns this trophy. The game reports the
   * current value with `reach(id, value)`, so the number is written once, beside the description.
   */
  threshold?: number;
}

export interface Trophy extends TrophyDef {
  /** Game slug, or 'arcade' for arcade-wide trophies. */
  game: string;
}
