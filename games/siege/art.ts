/**
 * Original pixel art and scoring tables for Star Siege, as plain data ('#' = lit pixel). Each alien
 * has two frames for its marching animation. No Phaser here, so the tables can be checked in tests;
 * sprites.ts turns the bitmaps into textures.
 */
export const ART = {
  orb: [
    ['..#####..', '.#######.', '##.###.##', '#########', '.#.#.#.#.', '#.......#'],
    ['..#####..', '.#######.', '##.###.##', '#########', '#.#.#.#.#', '.#.....#.'],
  ],
  stinger: [
    ['....###....', '...#####...', '..##.#.##..', '.#########.', '#.#######.#', '#..#...#..#', '..#.....#..'],
    ['....###....', '...#####...', '..##.#.##..', '.#########.', '#.#######.#', '...#...#...', '.#.......#.'],
  ],
  drone: [
    ['..######..', '.########.', '##.####.##', '##########', '.##.##.##.', '##......##'],
    ['..######..', '.########.', '##.####.##', '##########', '.##.##.##.', '.##....##.'],
  ],
  cannon: [['......#......', '.....###.....', '.###########.', '#############', '#############']],
  mothership: [
    ['.....######.....', '...##########...', '..############..', '.##.##.##.##.##.', '################', '..###..##..###..'],
  ],
} as const;

export type AlienKind = 'orb' | 'stinger' | 'drone';
export const ALIEN_KINDS: readonly AlienKind[] = ['orb', 'stinger', 'drone'];

/** Row kinds from top to bottom, and what each is worth. */
export const ROW_KINDS: AlienKind[] = ['orb', 'stinger', 'stinger', 'drone', 'drone'];
export const ALIEN_POINTS: Record<AlienKind, number> = { orb: 30, stinger: 20, drone: 10 };
