/**
 * Neon Crates levels, easiest first. Each map is a text grid (see rules.ts for the characters).
 * `par` is the fewest moves that solve the level; the tests check it against a solver, so a new or
 * changed level needs its par updated to match.
 */
export interface LevelDef {
  name: string;
  par: number;
  map: readonly string[];
}

export const LEVELS: readonly LevelDef[] = [
  {
    name: 'First Push',
    par: 3,
    map: [
      '#######',
      '#@ $ .#',
      '#######',
    ],
  },
  {
    name: 'Corner',
    par: 7,
    map: [
      '######',
      '#    #',
      '# $# #',
      '#@ . #',
      '######',
    ],
  },
  {
    name: 'Cross',
    par: 7,
    map: [
      '  ###',
      '  #.#',
      '###$###',
      '#.$@$.#',
      '###$###',
      '  #.#',
      '  ###',
    ],
  },
  {
    name: 'Shelf',
    par: 10,
    map: [
      '########',
      '#. .   #',
      '# $$#  #',
      '#  $ . #',
      '## @ ###',
      ' #####',
    ],
  },
  {
    name: 'Pair',
    par: 14,
    map: [
      '########',
      '#      #',
      '# $ $..#',
      '#@     #',
      '########',
    ],
  },
  {
    name: 'Three Doors',
    par: 14,
    map: [
      '#########',
      '#@      #',
      '#  $$$  #',
      '##.#.#.##',
      ' #     #',
      ' #######',
    ],
  },
  {
    name: 'Detour',
    par: 15,
    map: [
      '  #####',
      '###   #',
      '#@$ # #',
      '# $ . #',
      '#.  ###',
      '#####',
    ],
  },
  {
    name: 'Twin Rooms',
    par: 27,
    map: [
      '##########',
      '#        #',
      '# $  $ $ #',
      '# ##..## #',
      '#   .@   #',
      '##########',
    ],
  },
  {
    name: 'Hook',
    par: 29,
    map: [
      '  ######',
      '  #    #',
      '###$## #',
      '#  . $ #',
      '# #.   #',
      '# $. ###',
      '##@  #',
      ' #####',
    ],
  },
  {
    name: 'Bend',
    par: 34,
    map: [
      '#######',
      '#     #',
      '# # # #',
      '# $.$ #',
      '##.@.##',
      ' #$.$#',
      ' #   #',
      ' #   #',
      ' #####',
    ],
  },
  {
    name: 'Vault',
    par: 35,
    map: [
      '  #####',
      '###   #',
      '#  $# ##',
      '# #  . #',
      '# . *$ #',
      '##  #@ #',
      ' #.$  ##',
      ' ######',
    ],
  },
  {
    name: 'Lanes',
    par: 35,
    map: [
      '#########',
      '#       #',
      '#.  $   #',
      '#.# #$# #',
      '#.  $  @#',
      '#########',
    ],
  },
  {
    name: 'Switchback',
    par: 39,
    map: [
      '#########',
      '#@  #   #',
      '# $   $ #',
      '### # ###',
      '#  $#$  #',
      '#  .#.  #',
      '#  . .  #',
      '#########',
    ],
  },
  {
    name: 'Warehouse',
    par: 50,
    map: [
      ' #########',
      ' #       #',
      ' # $   $ #',
      '##$##.## #',
      '#  . . . #',
      '# $ ## $##',
      '#  .@   #',
      '#########',
    ],
  },
  {
    name: 'Storeroom',
    par: 68,
    map: [
      ' #######',
      ' #     ###',
      '##$##.  #',
      '#   $ # #',
      '# #.*.$ #',
      '#   $ # #',
      '###  .  #',
      '  #@#####',
      '  ###',
    ],
  },
];
