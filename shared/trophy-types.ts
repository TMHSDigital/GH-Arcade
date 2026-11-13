/** A trophy as a game declares it. The game it belongs to comes from the folder it is declared in. */
export interface TrophyDef {
  id: string;
  title: string;
  description: string;
  /** Unlocks automatically when this counter reaches `target`. */
  counter?: string;
  target?: number;
}

export interface Trophy extends TrophyDef {
  /** Game slug, or 'arcade' for arcade-wide trophies. */
  game: string;
}
